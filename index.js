const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const qrcode = require('qrcode-terminal')
const pino = require('pino')
const fs = require('fs')
const path = require('path')

// Bot Configuration
const BOT_NAME = 'Amaan Store'
const ADMIN_NUMBER = '6281230953140' // Replace with admin number (without + or 00)
const PRODUCTS_FILE = path.join(__dirname, 'products.json')
const AUTH_STATUS_FILE = path.join(__dirname, 'auth_status.json')

// Initialize files with default content
function initFile(filePath, defaultContent) {
    try {
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf-8').trim()
            if (content) {
                JSON.parse(content)
                return
            }
        }
        fs.writeFileSync(filePath, JSON.stringify(defaultContent, null, 2))
    } catch (error) {
        console.error(`Error initializing ${filePath}:`, error)
        fs.writeFileSync(filePath, JSON.stringify(defaultContent, null, 2))
    }
}

// Initialize files
initFile(PRODUCTS_FILE, {
    'Spotify': {
        description: 'Akun Spotify Premium',
        variants: {
            '1BSpo': { price: 50000, info: '1 Bulan' },
            '2BSpo': { price: 100000, info: '2 Bulan' },
            '3BSpo': { price: 150000, info: '3 Bulan' }
        }
    }
})

initFile(AUTH_STATUS_FILE, {
    isAuthenticated: false,
    lastAuth: null
})

// Load data
function loadData() {
    try {
        const products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf-8'))
        const authStatus = JSON.parse(fs.readFileSync(AUTH_STATUS_FILE, 'utf-8'))
        
        if (authStatus.lastAuth) {
            const lastAuthTime = new Date(authStatus.lastAuth).getTime()
            if (Date.now() - lastAuthTime > 86400000) {
                authStatus.isAuthenticated = false
            }
        }
        
        return { products, authStatus }
    } catch (error) {
        console.error('Error loading data:', error)
        return {
            products: {
                'Spotify': {
                    description: 'Akun Spotify Premium',
                    variants: {
                        '1BSpo': { price: 50000, info: '1 Bulan' },
                        '2BSpo': { price: 100000, info: '2 Bulan' },
                        '3BSpo': { price: 150000, info: '3 Bulan' }
                    }
                }
            },
            authStatus: { isAuthenticated: false, lastAuth: null }
        }
    }
}

const { products: digitalProducts, authStatus } = loadData()

function saveData() {
    try {
        fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(digitalProducts, null, 2))
        fs.writeFileSync(AUTH_STATUS_FILE, JSON.stringify(authStatus, null, 2))
    } catch (error) {
        console.error('Error saving data:', error)
    }
}

async function startBot() {
    const logger = pino({ level: 'silent' })
    
    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth')

        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: !authStatus.isAuthenticated,
            browser: ['Mac OS', 'Safari', '15.0'],
            connectTimeoutMs: 30000,
            logger: logger,
            keepAliveIntervalMs: 30000,
            markOnlineOnConnect: true,
            syncFullHistory: false,
            getMessage: async () => undefined
        })

        // Handle connection events
        sock.ev.on('connection.update', async (update) => {
            const { connection, qr } = update
            
            if (qr && !authStatus.isAuthenticated) {
                qrcode.generate(qr, { small: true })
                console.log(`\n🔑 Scan QR di atas untuk menghubungkan ${BOT_NAME}`)
            }
            
            if (connection === 'open') {
                authStatus.isAuthenticated = true
                authStatus.lastAuth = new Date().toISOString()
                saveData()
                console.log('\n🎉 Berhasil terhubung ke WhatsApp!')
                
                try {
                    await sock.sendMessage(`${ADMIN_NUMBER}@s.whatsapp.net`, {
                        text: `📱 *Notifikasi ${BOT_NAME}*\n\nPerangkat berhasil terhubung!\n\n🕒 ${new Date().toLocaleString()}`
                    })
                } catch (error) {
                    console.error('Gagal mengirim notifikasi:', error)
                }
            }
            
            if (connection === 'close') {
                const shouldReconnect = (update.lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut
                console.log(`\n[${BOT_NAME}] Koneksi terputus, mencoba sambung ulang...`)
                if (shouldReconnect) {
                    setTimeout(startBot, 5000)
                } else {
                    console.log('⚠️ Bot telah logout, silakan scan QR code lagi')
                    authStatus.isAuthenticated = false
                    saveData()
                    setTimeout(startBot, 1000)
                }
            }
        })

        sock.ev.on('creds.update', saveCreds)
    
        sock.ev.on('messages.upsert', async ({ messages }) => {
            const m = messages[0]
            if (!m.message || m.key.fromMe || !m.key.remoteJid.endsWith('@g.us')) return

            const msg = (m.message.conversation || m.message.extendedTextMessage?.text || '').toLowerCase()
            const originalMsg = m.message.conversation || m.message.extendedTextMessage?.text || ''
            const jid = m.key.remoteJid
            const sender = m.key.participant || m.key.remoteJid
            const isAdmin = sender.includes(ADMIN_NUMBER)
            const isBot = m.key.fromMe
            const isQuoted = !!m.message?.extendedTextMessage?.contextInfo?.quotedMessage
            const quotedMsg = isQuoted 
                ? (m.message.extendedTextMessage.contextInfo.quotedMessage.conversation || '').toLowerCase()
                : ''
            const quotedSender = isQuoted ? m.message.extendedTextMessage.contextInfo.participant : null
            const isQuotedFromBot = isQuoted && quotedSender.endsWith('@s.whatsapp.net')

            try {
            
                const adminKeywords = ['admin', 'adminn', 'farhan', 'farhann', 'farhaan', 
                                     'farhaann', 'aman', 'amaan', 'amann', 'amaann']
                
                if (!isAdmin && !isBot && adminKeywords.some(keyword => msg === keyword)) {
                    const senderName = originalMsg.split('@')[0] || sender.split('@')[0]
                    await sock.sendMessage(jid, {
                        text: `📢 *ADMIN!* dipanggil si @${senderName} nih, coba simak dulu barangkali penting!`,
                        mentions: [`${ADMIN_NUMBER}@s.whatsapp.net`, sender]
                    })
                    return
                }

                // Admin commands
                if (msg === 'adminonly') {
                    if (isAdmin) {
                        await showAdminHelp(sock, jid)
                    } else {
                        await sock.sendMessage(jid, { 
                            text: `⛔ *Akses Ditolak!*\n\nPerintah ini hanya untuk admin ${BOT_NAME}.`,
                            mentions: [sender]
                        })
                    }
                    return
                }
                
                // Rest of admin commands (only accessible by admin)
                    if (msg === 'tagall') {
                if (isAdmin) {
                        await handleTagAll(sock, jid)
                    } else {
                        await sock.sendMessage(jid, { 
                            text: `⛔ *Akses Ditolak!*\n\nPerintah ini hanya untuk admin ${BOT_NAME}.`,
                            mentions: [sender]
                        })
                    }
                        return
                    }

                    if (msg.startsWith('tambah produk')) {
                if (isAdmin) {
                        await addProduct(sock, jid, originalMsg)
                    } else {
                        await sock.sendMessage(jid, { 
                            text: `⛔ *Akses Ditolak!*\n\nPerintah ini hanya untuk admin ${BOT_NAME}.`,
                            mentions: [sender]
                        })
                    }
                        return
                    }
                    
                    if (msg.startsWith('hapus produk')) {
                        const productNamePart = originalMsg.split('hapus produk')[1].trim()
                        const productKey = Object.keys(digitalProducts).find(
                            key => key.toLowerCase() === productNamePart.toLowerCase()
                        )
                if (isAdmin) {
                        if (productKey) {
                            await removeProduct(sock, jid, productKey)
                        } else {
                            await sock.sendMessage(jid, {
                                text: '⚠️ Format salah atau produk tidak ditemukan!\n\n' +
                                'Coba : hapus produk [nama produk]'
                            })
                        }
                    } else {
                        await sock.sendMessage(jid, { 
                            text: `⛔ *Akses Ditolak!*\n\nPerintah ini hanya untuk admin ${BOT_NAME}.`,
                            mentions: [sender]
                        })
                    }
                        return
                    }
                    
                    if (msg.startsWith('update varian')) {
                    if (isAdmin) {
                        const parts = originalMsg.split('\n')
                        if (parts.length < 4) {
                            return await sock.sendMessage(jid, {
                                text: '⚠️ Format salah. Coba :\n' +
                                    'update varian\n' +
                                    '[nama produk]\n' +
                                    '[kode varian lama]\n' +
                                    '[kode varian baru] [harga baru] [info baru]\n\n' +
                                    'Contoh:\n' +
                                    'update varian\n' +
                                    'Netflix\n' +
                                    'NET1B\n' +
                                    'NET1B 25000 1 Bulan Premium'
                            })
                        }
                        
                        const productName = parts[1].trim()
                        const oldVariant = parts[2].trim()
                        const newVariantLine = parts[3].trim()
                        
                        // Parse new variant details
                        const firstSpace = newVariantLine.indexOf(' ')
                        const lastSpace = newVariantLine.lastIndexOf(' ')
                        
                        if (firstSpace === -1 || lastSpace === -1 || firstSpace === lastSpace) {
                            return await sock.sendMessage(jid, {
                                text: `⚠️ Format varian baru salah. Gunakan: [varian] [harga] [info]`
                            })
                        }
                        
                        const newVariantCode = newVariantLine.substring(0, firstSpace)
                        const newPrice = parseInt(newVariantLine.substring(firstSpace + 1, lastSpace))
                        const newInfo = newVariantLine.substring(lastSpace + 1)
                        
                        if (isNaN(newPrice)) {
                            return await sock.sendMessage(jid, {
                                text: `⚠️ Harga harus angka. Format salah di: ${newVariantLine}`
                            })
                        }
                        
                        await updateVariant(sock, jid, productName, oldVariant, newVariantCode, newPrice, newInfo)
                    } else {
                        await sock.sendMessage(jid, { 
                            text: `⛔ *Akses Ditolak!*\n\nPerintah ini hanya untuk admin ${BOT_NAME}.`,
                            mentions: [sender]
                        })
                    }
                        return
                    }
                    
                    if (msg === 'done' && m.message?.extendedTextMessage?.contextInfo) {
                        const contextInfo = m.message.extendedTextMessage.contextInfo
                        const quotedMsg = (contextInfo?.quotedMessage?.conversation || '').toLowerCase()
                        const originalSender = contextInfo?.participant || ''

                        let foundProduct = null
                        let foundVariant = null

                        for (const [productName, product] of Object.entries(digitalProducts)) {
                            const variantEntry = Object.entries(product.variants).find(([variant]) =>
                                variant.toLowerCase() === quotedMsg
                            )

                            if (variantEntry) {
                                foundProduct = productName
                                foundVariant = variantEntry
                                break
                            }
                        }

                            const [variantCode, { price, info }] = foundVariant
                if (isAdmin) {
                        if (foundProduct && foundVariant) {
                            await sock.sendMessage(jid, {
                                text: `✅ *Orderan Selesai!*\n\n` +
                                    `Terima kasih @${originalSender.split('@')[0]} telah memesan:\n` +
                                    `Produk: ${foundProduct}\n` +
                                    `Variasi: ${variantCode} (${info})\n` +
                                    `Harga: Rp${price.toLocaleString('id-ID')}\n\n` +
                                    `Silakan cek pesan pribadi untuk detail akun!`,
                                mentions: [originalSender]
                            })
                        } else {
                            await sock.sendMessage(jid, {
                                text: '⚠️ Kode varian tidak valid atau tidak ditemukan dalam database. Pastikan Anda mengutip pesan dengan kode varian yang benar.'
                            })
                        }
                    } else {
                        await sock.sendMessage(jid, { 
                            text: `⛔ *Akses Ditolak!*\n\nPerintah ini hanya untuk admin ${BOT_NAME}.`,
                            mentions: [sender]
                        })
                    }
                        return
                    }
                    
                // Customer commands
                if (msg === 'menu') {
                    await showProductList(sock, jid)
                }
                else if (Object.keys(digitalProducts).some(product => 
                    product.toLowerCase() === msg
                )) {
                    // Find the correct product name with original case
                    const productKey = Object.keys(digitalProducts).find(
                        key => key.toLowerCase() === msg
                    )
                    await showProductDetails(sock, jid, productKey)
                }
                else if (isVariant(msg)) {
                    // Find the correct variant with original case
                    let originalVariant = ''
                    for (const product of Object.values(digitalProducts)) {
                        const variant = Object.keys(product.variants).find(
                            v => v.toLowerCase() === msg
                        )
                        if (variant) {
                            originalVariant = variant
                            break
                        }
                    }
                    await processOrder(sock, jid, originalVariant, sender)
                }
                else if (msg === 'help') {
                    await showHelp(sock, jid)
                }
            } catch (error) {
                console.error('Error processing message:', error)
            }
        })

        function isVariant(msg) {
            return Object.values(digitalProducts).some(product => 
                Object.keys(product.variants).some(variant => 
                    variant.toLowerCase() === msg
                )
            )
        }

        async function handleTagAll(sock, jid) {
            try {
                const groupMetadata = await sock.groupMetadata(jid)
                const participants = groupMetadata.participants.map(p => p.id)
                const mentions = participants.filter(id => !id.includes(ADMIN_NUMBER))
                
                await sock.sendMessage(jid, {
                    text: `📢 *Pemberitahuan Untuk Semua Member!*\n\n` +
                        `${mentions.map((_, i) => '@').join('')}\n\n` +
                        `Ada pengumuman penting dari admin!`,
                    mentions: mentions
                })
            } catch (error) {
                console.error('Error in tagall:', error)
            }
        }

        async function addProduct(sock, jid, msg) {
            const parts = msg.split('\n')
            if (parts.length < 4) {
                return await sock.sendMessage(jid, {
                    text: '⚠️ Format salah. Coba :\n' +
                        'tambah produk\n' +
                        '[nama produk]\n' +
                        '[deskripsi]\n' +
                        '[varian] [harga] [info]\n' +
                        '[varian] [harga] [info]\n' +
                        '...\n\n' +
                        'Contoh:\n' +
                        'tambah produk\n' +
                        'Netflix\n' +
                        'Akun Netflix Premium\n' +
                        'NET1B 30000 1 Bulan Sharing\n' +
                        'NET3B 80000 3 Bulan Sharing'
                })
            }

            const productName = parts[1].trim()
            const description = parts[2].trim()
            const variants = {}
            
            for (let i = 3; i < parts.length; i++) {
                const line = parts[i].trim()
                const firstSpace = line.indexOf(' ')
                const lastSpace = line.lastIndexOf(' ')
                
                if (firstSpace === -1 || lastSpace === -1 || firstSpace === lastSpace) {
                    return await sock.sendMessage(jid, {
                        text: `⚠️ Format varian salah di: ${line}\nGunakan: [varian] [harga] [info]`
                    })
                }
                
                const variantName = line.substring(0, firstSpace)
                const price = parseInt(line.substring(firstSpace + 1, lastSpace))
                const variantInfo = line.substring(lastSpace + 1)
                
                if (isNaN(price)) {
                    return await sock.sendMessage(jid, {
                        text: `⚠️ Harga harus angka. Format salah di: ${line}`
                    })
                }
                
                variants[variantName] = { price, info: variantInfo }
            }
            
            digitalProducts[productName] = {
                description,
                variants
            }
            
            saveData()
            
            await sock.sendMessage(jid, {
                text: `✅ Produk "${productName}" berhasil ditambahkan!\n\n` +
                    `Deskripsi: ${description}\n` +
                    `Varian: ${Object.keys(variants).join(', ')}`
            })
        }

        async function removeProduct(sock, jid, productName) {
            if (!digitalProducts[productName]) {
                return await sock.sendMessage(jid, {
                    text: `⚠️ Produk "${productName}" tidak ditemukan!`
                })
            }
            
            delete digitalProducts[productName]
            saveData()
            
            await sock.sendMessage(jid, {
                text: `✅ Produk "${productName}" berhasil dihapus!`
            })
        }

        async function showProductList(sock, jid) {
            if (Object.keys(digitalProducts).length === 0) {
                return await sock.sendMessage(jid, {
                    text: '⚠️ Belum ada produk yang tersedia.'
                })
            }
            
            let productList = `📌 *Daftar Produk ${BOT_NAME}*\n\n`
            Object.keys(digitalProducts).forEach((product, index) => {
                productList += `${index + 1}. ${product}\n`
            })
            productList += `\n🔹 Ketik nama produk untuk melihat detail`
            await sock.sendMessage(jid, { text: productList })
        }

        async function showProductDetails(sock, jid, productName) {
            const productKey = Object.keys(digitalProducts).find(
                key => key.toLowerCase() === productName.toLowerCase()
            )
            
            if (!productKey) {
                return await sock.sendMessage(jid, { 
                    text: '⚠️ Produk tidak ditemukan. Ketik *menu* untuk lihat daftar.'
                })
            }
            
            const product = digitalProducts[productKey]
            let detailText = `📦 *${productKey}*\n\n${product.description}\n\n💵 *Daftar Harga:*\n`
            
            Object.entries(product.variants).forEach(([variant, {price, info}]) => {
                detailText += `- ${variant}: Rp${price.toLocaleString('id-ID')} (${info})\n`
            })
            
            detailText += `\n💡 *Cara Order:*\nKetik *${Object.keys(product.variants)[0].toLowerCase()}* untuk memesan`
            
            await sock.sendMessage(jid, { text: detailText })
        }

        async function processOrder(sock, jid, variant, sender) {
            let selectedProduct = null
            let selectedVariant = null
            let productDetails = null
            
            for (const [productName, product] of Object.entries(digitalProducts)) {
                const foundVariant = Object.entries(product.variants).find(
                    ([v]) => v.toLowerCase() === variant.toLowerCase()
                )
                
                if (foundVariant) {
                    selectedProduct = productName
                    selectedVariant = foundVariant[0]
                    productDetails = foundVariant[1]
                    break
                }
            }
            
            if (!selectedProduct || !productDetails) {
                return await sock.sendMessage(jid, { 
                    text: '⚠️ Variasi tidak ditemukan. Ketik *menu* untuk lihat produk.'
                })
            }
            
            await sock.sendMessage(jid, { 
                text: `🕒 *Pesanan Diterima!*\n\nProduk: ${selectedProduct}\nVariasi: ${selectedVariant}\nHarga: Rp${productDetails.price.toLocaleString('id-ID')}\n\nAdmin akan segera memproses pesanan Anda, ditunggu yaaa`
            })
            
            await sock.sendMessage(jid, {
                text: `📢 *ADMIN!* Ada pesanan baru dari @${sender.split('@')[0]}:\n\n` +
                    `Produk: ${selectedProduct}\n` +
                    `Variasi: ${selectedVariant}\n` +
                    `Harga: Rp${productDetails.price.toLocaleString('id-ID')}\n\n` +
                    `*Sabar ya azrieelll💅💅💅, kalo belum diproses berarti admin lagi sibuk😚*`,
                mentions: [`${ADMIN_NUMBER}@s.whatsapp.net`, sender]
            })
        }

        async function updateVariant(sock, jid, productName, oldVariant, newVariantCode, newPrice, newInfo) {
            // Find product with case-insensitive search
            const productKey = Object.keys(digitalProducts).find(
                key => key.toLowerCase() === productName.toLowerCase()
            )
            
            if (!productKey) {
                return await sock.sendMessage(jid, {
                    text: `⚠️ Produk "${productName}" tidak ditemukan!`
                })
            }
            
            const product = digitalProducts[productKey]
            
            // Find old variant with case-insensitive search
            const oldVariantKey = Object.keys(product.variants).find(
                v => v.toLowerCase() === oldVariant.toLowerCase()
            )
            
            if (!oldVariantKey) {
                return await sock.sendMessage(jid, {
                    text: `⚠️ Variant "${oldVariant}" tidak ditemukan dalam produk "${productKey}"!`
                })
            }
            
            // Update the variant
            delete product.variants[oldVariantKey]
            product.variants[newVariantCode] = {
                price: newPrice,
                info: newInfo
            }
            
            saveData()
            
            await sock.sendMessage(jid, {
                text: `✅ Variant berhasil diupdate!\n\n` +
                    `Produk: ${productKey}\n` +
                    `Varian lama: ${oldVariantKey}\n` +
                    `Varian baru: ${newVariantCode} (Rp${newPrice.toLocaleString('id-ID')} - ${newInfo})`
            })
        }

        async function showHelp(sock, jid) {
            const helpText = `🆘 *Bantuan ${BOT_NAME}*\n\n` +
                `• *menu* - Lihat daftar produk\n` +
                `• *[nama produk]* - Lihat varian yang tersedia\n` +
                `• *[kode varian]* - Langsung memesan produk\n` +
                `• *help* - Tampilkan bantuan ini`
            
            await sock.sendMessage(jid, { text: helpText })
        }

        async function showAdminHelp(sock, jid) {
            const helpText = `🛠️ *Perintah Admin ${BOT_NAME}*\n\n` +
                `- *adminonly* - Tampilkan menu admin\n` +
                `- *tagall* - Mention semua member\n` +
                `- *tambah produk* - Tambah produk baru\n` +
                `- *hapus produk [nama]* - Hapus produk\n` +
                `- *update varian* - Update varian produk\n` +
                `- *done* - Konfirmasi pesanan selesai (reply pesan pembeli)`
            await sock.sendMessage(jid, { text: helpText })
        }

    } catch (error) {
        console.error(`[${BOT_NAME}] Error:`, error)
        setTimeout(startBot, 10000)
    }
}

console.log(`🚀 Memulai ${BOT_NAME}...`)
startBot()