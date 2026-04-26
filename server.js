const express = require('express');
const multer = require('multer');
const path = require('path');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const app = express();

// Conexión a Railway MySQL
const db = mysql.createPool(process.env.DATABASE_URL).promise();

// Middlewares
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Config de Multer para guardar fotos
const storage = multer.diskStorage({
  destination: './public/uploads/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname))
  }
});
const upload = multer({ storage });

// RUTA: REGISTRO CON FOTO
app.post('/registro', upload.single('profile_pic'), async (req, res) => {
  const { username, password, name, last_name, birth_date, gender, phone, email, address, city, country } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const profilePic = req.file? `/uploads/${req.file.filename}` : '/uploads/default.png';
  
  await db.query(
    `INSERT INTO users (profile_pic, username, password, name, last_name, birth_date, gender, phone, email, address, city, country) 
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [profilePic, username, hashedPassword, name, last_name, birth_date, gender, phone, email, address, city, country]
  );
  
  res.redirect(`/dashboard.html?user=${username}`);
});

// RUTA: API PARA EL DASHBOARD
app.get('/api/user/:username', async (req, res) => {
  const [rows] = await db.query('SELECT * FROM users WHERE username =?', [req.params.username]);
  if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
  delete rows[0].password; // No mandamos el hash
  res.json(rows[0]);
});

// RUTA: ACTUALIZAR DATOS DEL USUARIO
app.post('/api/update-user', upload.single('profile_pic'), async (req, res) => {
  const { username, name, last_name, phone, address, city, country } = req.body;
  let query = 'UPDATE users SET name=?, last_name=?, phone=?, address=?, city=?, country=?';
  let params = [name, last_name, phone, address, city, country];
  
  if (req.file) {
    query += ', profile_pic=?';
    params.push(`/uploads/${req.file.filename}`);
  }
  
  query += ' WHERE username=?';
  params.push(username);
  
  await db.query(query, params);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));
