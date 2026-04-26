const express = require('express');
const multer = require('multer');
const path = require('path');
const mysql = require('mysql2');
const app = express();

// 1. Servir archivos de la carpeta 'public'
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// 2. Config de multer para guardar imágenes
const storage = multer.diskStorage({
  destination: './public/uploads/', // Crea esta carpeta
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname))
  }
});
const upload = multer({ storage });

// 3. Ruta de registro con upload
app.post('/registro', upload.single('profile_pic'), async (req, res) => {
  const { username, password, name, last_name, birth_date, gender, phone, email, address, city, country } = req.body;
  
  // Si subió foto, usa esa ruta. Si no, usa default
  const profilePic = req.file? `/uploads/${req.file.filename}` : '/uploads/default.png';
  
  await db.query(
    `INSERT INTO users (profile_pic, username, password, name, last_name, birth_date, gender, phone, email, address, city, country) 
     VALUES (?,?,?,?,?,?,?,?)`,
    [profilePic, username, password, name, last_name, birth_date, gender, phone, email, address, city, country]
  );
  
  res.redirect(`/bienvenida.html?user=${username}`);
});
