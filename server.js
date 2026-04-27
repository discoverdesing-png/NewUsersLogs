// ACTUALIZAR last_seen EN CADA REQUEST
app.use((req, res, next) => {
    const username = req.query.user || req.body.username;
    if (username) {
        db.query('UPDATE users SET last_seen = NOW() WHERE username =?', [username]);
    }
    next();
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
