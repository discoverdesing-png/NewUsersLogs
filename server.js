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

if (!fs.existsSync('./uploads')){
    fs.mkdirSync('./uploads');
}

const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

const db = mysql.createPool({
    host: process.env.MYSQLHOST,
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQLDATABASE,
    port: process.env.MYSQLPORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Actualizar last_seen en cada request que mande username
app.use((req, res, next) => {
    const username = req.query.user || req.body.username || req.headers['x-username'];
    if (username) {
        db.query('UPDATE users SET last_seen = NOW() WHERE username =?', [username]);
    }
    next();
});

app.post('/register', upload.single('profile_pic'), async (req, res) => {
    try {
        const { username, password, name, last_name, birth_date, gender, phone, email, address, city, country } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const profile_pic = req.file? `/uploads/${req.file.filename}` : null;

        const sql = `INSERT INTO users (username, password, name, last_name, birth_date, gender, phone, email, address, city, country, profile_pic)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`;

        db.query(sql, [username, hashedPassword, name, last_name, birth_date, gender, phone, email, address, city, country, profile_pic],
        (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(400).json({ success: false, message: 'Error: El usuario ya existe' });
                }
                console.error(err);
                return res.status(500).json({ success: false, message: 'Error en el servidor' });
            }
            res.json({ success: true, username: username });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error en el servidor' });
    }
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;

    db.query('SELECT * FROM users WHERE username =?', [username], async (err, results) => {
        if (err) {
            console.error('Error en login:', err);
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

        res.json({ success: true, username: user.username, is_admin: user.is_admin });
    });
});

app.get('/api/user/:username', (req, res) => {
    db.query('SELECT username, name, last_name, email, phone, birth_date, gender, address, city, country, profile_pic, is_admin FROM users WHERE username =?',
        [req.params.username],
        (err, results) => {
            if (err || results.length === 0) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            res.json(results[0]);
        });
});

// === RUTAS ADMIN ===
app.get('/api/admin/users', (req, res) => {
    const { search } = req.query;
    let sql = `SELECT id, username, name, last_name, email, phone, is_admin, profile_pic, 
               IF(TIMESTAMPDIFF(MINUTE, last_seen, NOW()) < 5, 1, 0) as is_online 
               FROM users`;
    let params = [];

    if (search) {
        sql += ` WHERE username LIKE? OR name LIKE? OR last_name LIKE? OR email LIKE?`;
        const s = `%${search}%`;
        params = [s, s, s, s];
    }
    
    sql += ` ORDER BY is_online DESC, username ASC`;

    db.query(sql, params, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error en el servidor' });
        }
        res.json(results);
    });
});

app.get('/api/admin/user/:id', (req, res) => {
    db.query('SELECT * FROM users WHERE id =?', [req.params.id], (err, results) => {
        if (err || results.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        delete results[0].password;
        res.json(results[0]);
    });
});

app.put('/api/admin/user/:id', upload.single('profile_pic'), async (req, res) => {
    try {
        const { username, name, last_name, birth_date, gender, phone, email, address, city, country, password, is_admin } = req.body;
        const userId = req.params.id;

        // Verificar duplicados EXCLUYENDO el usuario actual
        const checkSql = `SELECT id FROM users WHERE (username =? OR email =?) AND id!=?`;
        db.query(checkSql, [username, email, userId], async (checkErr, checkResults) => {
            if (checkErr) {
                console.error(checkErr);
                return res.json({ success: false, message: 'Error al verificar datos' });
            }
            
            if (checkResults.length > 0) {
                return res.json({ success: false, message: 'El usuario o email ya existe en otra cuenta' });
            }

            let sql = `UPDATE users SET username=?, name=?, last_name=?, birth_date=?, gender=?, phone=?, email=?, address=?, city=?, country=?, is_admin=?`;
            let params = [username, name, last_name, birth_date, gender, phone, email, address, city, country, is_admin || 0];

            if (password && password.trim()!== '') {
                const hashedPassword = await bcrypt.hash(password, 10);
                sql += `, password=?`;
                params.push(hashedPassword);
            }

            if (req.file) {
                sql += `, profile_pic=?`;
                params.push(`/uploads/${req.file.filename}`);
            }

            sql += ` WHERE id=?`;
            params.push(userId);

            db.query(sql, params, (err, result) => {
                if (err) {
                    console.error(err);
                    return res.json({ success: false, message: 'Error al modificar' });
                }
                res.json({ success: true, message: 'Usuario modificado correctamente' });
            });
        });
    } catch (error) {
        console.error(error);
        res.json({ success: false, message: 'Error en el servidor' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
