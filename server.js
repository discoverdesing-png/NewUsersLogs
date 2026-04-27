// === RUTAS ADMIN ===
// OBTENER TODOS LOS USUARIOS - SOLO ADMIN
app.get('/api/admin/users', (req, res) => {
    const { search } = req.query;
    let sql = `SELECT id, username, name, last_name, email, phone, is_admin FROM users`;
    let params = [];
    
    if (search) {
        sql += ` WHERE username LIKE? OR name LIKE? OR last_name LIKE? OR email LIKE?`;
        const s = `%${search}%`;
        params = [s, s, s, s];
    }
    
    db.query(sql, params, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error en el servidor' });
        }
        res.json(results);
    });
});

// OBTENER UN USUARIO POR ID PARA EDITAR
app.get('/api/admin/user/:id', (req, res) => {
    db.query('SELECT * FROM users WHERE id =?', [req.params.id], (err, results) => {
        if (err || results.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        delete results[0].password;
        res.json(results[0]);
    });
});

// MODIFICAR USUARIO
app.put('/api/admin/user/:id', upload.single('profile_pic'), async (req, res) => {
    try {
        const { username, name, last_name, birth_date, gender, phone, email, address, city, country, password, is_admin } = req.body;
        const userId = req.params.id;
        
        let sql = `UPDATE users SET username=?, name=?, last_name=?, birth_date=?, gender=?, phone=?, email=?, address=?, city=?, country=?, is_admin=?`;
        let params = [username, name, last_name, birth_date, gender, phone, email, address, city, country, is_admin];
        
        if (password) {
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
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.json({ success: false, message: 'El usuario o email ya existe' });
                }
                console.error(err);
                return res.json({ success: false, message: 'Error al modificar' });
            }
            res.json({ success: true, message: 'Usuario modificado correctamente' });
        });
    } catch (error) {
        console.error(error);
        res.json({ success: false, message: 'Error en el servidor' });
    }
});

// MODIFICA EL LOGIN PARA QUE REGRESE is_admin
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
