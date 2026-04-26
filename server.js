const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// CREAR CARPETA UPLOADS SI NO EXISTE
if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
}

const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// CONEXIÓN MYSQL DE RAILWAY
const db = mysql.createConnection({
    host: process.env.MYSQLHOST || 'localhost',
    user: process.env.MYSQLUSER || 'root',
    password: process.env.MYSQLPASSWORD || '',
    database: process.env.MYSQLDATABASE || 'railway',
    port: process.env.MYSQLPORT || 3306
});

db.connect((err) => {
    if (err) {
        console.error('Error conectando MySQL:', err);
        return;
    }
    console.log('Conectado a MySQL');
    
    // CREAR TABLA SI NO EXISTE
    const createTable = `CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) UNIQUE,
        password VARCHAR(255),
        name VARCHAR(255),
        last_name VARCHAR(255),
        birth_date VARCHAR(255),
        gender VARCHAR(50),
        phone VARCHAR(50),
        email VARCHAR(255),
        address TEXT,
        city VARCHAR(255),
        country VARCHAR(255),
        profile_pic VARCHAR(255)
    )`;
    
    db.query(createTable, (err) => {
        if (err) console.error('Error creando tabla:', err);
    });
});

app.post('/register', upload.single('profile_pic'), async (req, res) => {
    try {
        const { username, password, name, last_name, birth_date, gender, phone, email, address, city, country } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const profile_pic = req.file? `/uploads/${req.file.filename}` : null;

        const sql = `INSERT INTO users (username, password, name, last_name, birth_date, gender, phone, email, address, city, country, profile_pic) 
                VALUES (?,?,?,?,?,?,?,?)`;
        
        db.query(sql, [username, hashedPassword, name, last_name, birth_date, gender, phone, email, address, city, country, profile_pic], 
        (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(400).send('Error: El usuario ya existe');
                }
                return res.status(500).send('Error en el servidor');
            }
            res.redirect(`/dashboard.html?user=${username}`);
        });
    } catch (error) {
        res.status(500).send('Error en el servidor');
    }
});

// LOGIN CON JSON - YA NO TE SACA DE LA PÁGINA
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    db.query('SELECT * FROM users WHERE username =?', [username], async (err, results) => {
        if (err) {
            return res.json({ success: false, message: 'Error en el servidor' });
        }
        
        if (results.length === 0) {
            return res.json({ success: false, message: 'Usuario no encontrado. Intente de nuevo' });
        }
        
        const user = results[0];
        const validPassword = await bcrypt.compare(password, user.password);
        
        if (!validPassword) {
            return res.json({ success: false, message: 'Contraseña incorrecta. Intente de nuevo' });
        }
        
        res.json({ success: true, username: user.username });
    });
});

app.get('/api/user/:username', (req, res) => {
    db.query('SELECT username, name, last_name, email, phone, birth_date, gender, address, city, country, profile_pic FROM users WHERE username =?', 
        [req.params.username], 
        (err, results) => {
            if (err || results.length === 0) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            res.json(results[0]);
        });
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
