const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

const db = new sqlite3.Database('./users.db', (err) => {
    if (err) console.error(err);
    else console.log('Conectado a SQLite');
});

db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    name TEXT,
    last_name TEXT,
    birth_date TEXT,
    gender TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    city TEXT,
    country TEXT,
    profile_pic TEXT
)`);

app.post('/register', upload.single('profile_pic'), async (req, res) => {
    try {
        const { username, password, name, last_name, birth_date, gender, phone, email, address, city, country } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const profile_pic = req.file ? `/uploads/${req.file.filename}` : null;

        db.run(`INSERT INTO users (username, password, name, last_name, birth_date, gender, phone, email, address, city, country, profile_pic) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [username, hashedPassword, name, last_name, birth_date, gender, phone, email, address, city, country, profile_pic],
            function(err) {
                if (err) return res.status(400).send('Error: El usuario ya existe');
                res.redirect(`/dashboard.html?user=${username}`);
            });
    } catch (error) {
        res.status(500).send('Error en el servidor');
    }
});

app.post('/login', express.json(), (req, res) => {
    const { username, password } = req.body;
    
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err || !user) {
            return res.json({ success: false, message: 'Usuario o contraseña incorrectos' });
        }
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.json({ success: false, message: 'Usuario o contraseña incorrectos' });
        }
        
        res.json({ success: true, username: user.username });
    });
});

app.get('/api/user/:username', (req, res) => {
    db.get('SELECT username, name, last_name, email, phone, birth_date, gender, address, city, country, profile_pic FROM users WHERE username = ?', 
        [req.params.username], 
        (err, user) => {
            if (err || !user) return res.status(404).json({ error: 'Usuario no encontrado' });
            res.json(user);
        });
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
