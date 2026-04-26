const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Configurar multer para subir fotos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/')
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname))
  }
});
const upload = multer({ storage: storage });

// Conexión a MySQL usando la variable de Railway
const db = mysql.createPool(process.env.DATABASE_URL);

// Rutas
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Registro
app.post('/register', upload.single('profile_pic'), async (req, res) => {
  const { username, password, name, last_name, birth_date, gender, phone, email, address, city, country } = req.body;
  const profile_pic = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const sql = `INSERT INTO users (profile_pic, username, password, name, last_name, birth_date, gender, phone, email, address, city, country) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    
    db.query(sql, [profile_pic, username, hashedPassword, name, last_name, birth_date, gender, phone, email, address, city, country], (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error al registrar usuario. ¿El username o email ya existen?' });
      }
      res.status(201).json({ message: 'Usuario registrado correctamente' });
    });
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// Login
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  const sql = 'SELECT * FROM users WHERE username = ?';
  db.query(sql, [username], async (err, results) => {
    if (err) return res.status(500).json({ error: 'Error en el servidor' });
    if (results.length === 0) return res.status(401).json({ error: 'Usuario no encontrado' });
    
    const user = results[0];
    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) return res.status(401).json({ error: 'Contraseña incorrecta' });
    
    res.json({ message: 'Login exitoso', user: { id: user.id, username: user.username, name: user.name } });
  });
});

// ESTA PARTE ES LA IMPORTANTE PARA RAILWAY
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
