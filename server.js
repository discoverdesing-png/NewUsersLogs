const express = require('express');
const multer = require('multer');
const path = require('path');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const app = express();

// Conexión Railway
const db = mysql.createPool(process.env.DATABASE_URL).promise();

// Middlewares
app.use(express.static('public')); // ESTO HACE QUE SE VEAN LAS IMÁGENES
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// MULTER: Para guardar las fotos en /public/uploads/
const storage = multer.diskStorage({
  destination: './public/uploads/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname))
  }
});
const upload = multer({ storage });

// REGISTRO CON FOTO
app.post('/register', upload.single('profile_pic'), async (req, res) => {
  const { username, password, name, last_name, birth_date, gender, phone, email, address, city, country } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  
  // Si subió foto usa esa, si no usa default
  const profilePic = req.file? `/uploads/${req.file.filename}` : '/uploads/default.png';
  
  await db.query(
    `INSERT INTO users (profile_pic, username, password, name, last_name, birth_date, gender, phone, email, address, city, country) 
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [profilePic, username, hashedPassword, name, last_name, birth_date, gender, phone, email, address, city, country]
  );
  
  res.redirect(`/bienvenida.html?user=${username}`);
});

// API PARA CARGAR DATOS EN BIENVENIDA.HTML
app.get('/api/user/:username', async (req, res) => {
  const [rows] = await db.query('SELECT * FROM users WHERE username =?', [req.params.username]);
  if (rows.length === 0) return res.status(404).json({ error: 'No existe' });
  delete rows[0].password;
  res.json(rows[0]);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor online`));
