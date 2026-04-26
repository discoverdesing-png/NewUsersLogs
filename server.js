const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
require('dotenv').config();

const app = express();
const upload = multer({ dest: 'public/uploads/' });

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const db = mysql.createPool(process.env.DATABASE_URL);

app.post('/register', upload.single('profile_pic'), async (req, res) => {
    const { username, password, name, last_name, birth_date, gender, phone, email, address, city, country } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const profilePicUrl = req.file? `/uploads/${req.file.filename}` : null;

    db.query(
        `INSERT INTO users (profile_pic, username, password, name, last_name, birth_date, gender, phone, email, address, city, country) 
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [profilePicUrl, username, hashedPassword, name, last_name, birth_date, gender, phone, email, address, city, country],
        (err, result) => {
            if (err) return res.status(500).send('Error: ' + err.message);
            res.redirect(`/bienvenida.html?user=${username}`);
        }
    );
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.query('SELECT * FROM users WHERE username =?', [username], async (err, results) => {
        if (err || results.length === 0) return res.status(401).send('Usuario no encontrado');
        const validPass = await bcrypt.compare(password, results[0].password);
        if (!validPass) return res.status(401).send('Password incorrecto');
        res.redirect(`/bienvenida.html?user=${username}`);
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server en puerto ${PORT}`));
