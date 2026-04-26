const express = require('express');
const multer = require('multer');
const path = require('path');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs'); // OJO: bcryptjs no bcrypt
require('dotenv').config();

const app = express();

// Conexión a MySQL de Railway
const db = mysql.createPool(process.env.DATABASE_URL).promise();

// Middlewares
app.use(express.static('public')); // Para que se vean las imágenes y HTML
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// MULTER: Config para guardar fotos en /public/uploads/
const storage = multer.diskStorage({
  destination: './public/uploads/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname))
  }
});
const upload = multer({ storage });

// RUTA DE REGISTRO
app.post('/register', upload.single('profile_pic'), async (req, res) => {
  try {
    const { username, password, name, last_name, birth_date, gender, phone, email, address, city, country } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Si subió foto usa esa ruta, si no usa default
    const profilePic = req.file? `/uploads/${req.file.filename}` : '/uploads/default.png';
    
    await db.query(
      `INSERT INTO users (profile_pic, username, password, name, last_name, birth_date, gender, phone, email, address, city, country) 
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [profilePic, username, hashedPassword, name, last_name, birth_date, gender, phone, email, address, city, country]
    );
    
    res.redirect(`/bienvenida.html?user=${username}`);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error en el registro');
  }
});

// API PARA CARGAR DATOS DEL USUARIO
app.get('/api/user/:username', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE username =?', [req.params.username]);
    if (rows.length === 0) return res.status(404).json({ error: 'Usuario no existe' });
    delete rows[0].password; // No mandamos la contraseña
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// RUTA LOGIN
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const [rows] = await db.query('SELECT * FROM users WHERE username =?', [username]);
    
    if (rows.length === 0) return res.status(401).send('Usuario no existe');
    
    const validPassword = await bcrypt.compare(password, rows[0].password);
    if (!validPassword) return res.status(401).send('Contraseña incorrecta');
    
    res.redirect(`/bienvenida.html?user=${username}`);
  } catch (error) {
    res.status(500).send('Error en login');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor online en puerto ${PORT}`));
