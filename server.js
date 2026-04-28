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

// === MIDDLEWARE: Actualizar last_seen ===
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

// === RUTA PASTELERIA REYNA ===
app.get('/PasteleriaReyna', (req, res) => {
    const { user } = req.query;
    if (user!== 'Reyna_34142') {
        return res.status(403).send('Acceso denegado');
    }
    res.sendFile(path.join(__dirname, 'public', 'PasteleriaReyna.html'));
});

// === RUTAS PROVEEDORES ===
app.get('/api/proveedores', (req, res) => {
    const { user } = req.query;
    if (user!== 'Reyna_34142') return res.status(403).json({ error: 'Acceso denegado' });
    
    db.query('SELECT * FROM proveedores WHERE owner_username =? ORDER BY nombre', [user], (err, results) => {
        if (err) return res.status(500).json({ error: 'Error en el servidor' });
        res.json(results);
    });
});

app.post('/api/proveedores', (req, res) => {
    const { user } = req.query;
    if (user!== 'Reyna_34142') return res.status(403).json({ error: 'Acceso denegado' });
    
    const { nombre, telefono, email, direccion } = req.body;
    db.query('INSERT INTO proveedores (nombre, telefono, email, direccion, owner_username) VALUES (?,?,?,?,?)', 
        [nombre, telefono, email, direccion, user], 
        (err, result) => {
            if (err) return res.json({ success: false, message: 'Error al crear proveedor' });
            res.json({ success: true, id: result.insertId });
        });
});

app.put('/api/proveedores/:id', (req, res) => {
    const { user } = req.query;
    if (user!== 'Reyna_34142') return res.status(403).json({ error: 'Acceso denegado' });
    
    const { nombre, telefono, email, direccion } = req.body;
    db.query('UPDATE proveedores SET nombre=?, telefono=?, email=?, direccion=? WHERE id=? AND owner_username=?', 
        [nombre, telefono, email, direccion, req.params.id, user], 
        (err) => {
            if (err) return res.json({ success: false, message: 'Error al modificar' });
            res.json({ success: true });
        });
});

app.delete('/api/proveedores/:id', (req, res) => {
    const { user } = req.query;
    if (user!== 'Reyna_34142') return res.status(403).json({ error: 'Acceso denegado' });
    
    db.query('DELETE FROM proveedores WHERE id=? AND owner_username=?', [req.params.id, user], (err) => {
        if (err) return res.json({ success: false, message: 'Error al eliminar' });
        res.json({ success: true });
    });
});

// === RUTAS PRODUCTOS ===
app.get('/api/productos', (req, res) => {
    const { user, search } = req.query;
    if (user!== 'Reyna_34142') return res.status(403).json({ error: 'Acceso denegado' });
    
    let sql = `SELECT p.*, prov.nombre as proveedor_nombre 
               FROM productos p 
               JOIN proveedores prov ON p.proveedor_id = prov.id 
               WHERE prov.owner_username =?`;
    let params = [user];
    
    if (search) {
        sql += ` AND (p.nombre LIKE? OR prov.nombre LIKE?)`;
        const s = `%${search}%`;
        params.push(s, s);
    }
    
    sql += ` ORDER BY p.nombre`;
    
    db.query(sql, params, (err, results) => {
        if (err) return res.status(500).json({ error: 'Error en el servidor' });
        res.json(results);
    });
});

app.post('/api/productos', (req, res) => {
    const { user } = req.query;
    if (user!== 'Reyna_34142') return res.status(403).json({ error: 'Acceso denegado' });
    
    const { proveedor_id, nombre, precio, unidad, stock_actual, stock_minimo } = req.body;
    db.query('INSERT INTO productos (proveedor_id, nombre, precio, unidad, stock_actual, stock_minimo) VALUES (?,?,?,?,?,?)', 
        [proveedor_id, nombre, precio, unidad, stock_actual || 0, stock_minimo || 2], 
        (err, result) => {
            if (err) return res.json({ success: false, message: 'Error al crear producto' });
            res.json({ success: true, id: result.insertId });
        });
});

app.put('/api/productos/:id', (req, res) => {
    const { user } = req.query;
    if (user!== 'Reyna_34142') return res.status(403).json({ error: 'Acceso denegado' });
    
    const { proveedor_id, nombre, precio, unidad, stock_minimo, stock_maximo } = req.body;
    db.query('UPDATE productos SET proveedor_id=?, nombre=?, precio=?, unidad=?, stock_minimo=?, stock_maximo=? WHERE id=?', 
        [proveedor_id, nombre, precio, unidad, stock_minimo, stock_maximo, req.params.id], 
        (err) => {
            if (err) return res.json({ success: false, message: 'Error al modificar' });
            res.json({ success: true });
        });
});

app.delete('/api/productos/:id', (req, res) => {
    const { user } = req.query;
    if (user!== 'Reyna_34142') return res.status(403).json({ error: 'Acceso denegado' });
    
    db.query('DELETE FROM productos WHERE id=?', [req.params.id], (err) => {
        if (err) return res.json({ success: false, message: 'Error al eliminar' });
        res.json({ success: true });
    });
});

// === RUTAS INVENTARIO ===
app.get('/api/inventario', (req, res) => {
    const { user } = req.query;
    if (user!== 'Reyna_34142') return res.status(403).json({ error: 'Acceso denegado' });
    
    const sql = `SELECT p.*, prov.nombre as proveedor_nombre,
                 CASE 
                    WHEN p.stock_actual = 0 THEN 'agotado'
                    WHEN p.stock_actual <= 2 THEN 'por_agotar'
                    WHEN p.stock_actual <= p.stock_minimo THEN 'bajo'
                    ELSE 'normal'
                 END as estado_stock
                 FROM productos p 
                 JOIN proveedores prov ON p.proveedor_id = prov.id 
                 WHERE prov.owner_username =?
                 ORDER BY p.stock_actual ASC`;
    
    db.query(sql, [user], (err, results) => {
        if (err) return res.status(500).json({ error: 'Error en el servidor' });
        res.json(results);
    });
});

app.post('/api/inventario/movimiento', (req, res) => {
    const { user } = req.query;
    if (user!== 'Reyna_34142') return res.status(403).json({ error: 'Acceso denegado' });
    
    const { producto_id, tipo, cantidad, motivo } = req.body;
    
    db.query('INSERT INTO inventario_movimientos (producto_id, tipo, cantidad, motivo, owner_username) VALUES (?,?,?,?,?)', 
        [producto_id, tipo, cantidad, motivo, user], 
        (err) => {
            if (err) return res.json({ success: false, message: 'Error al registrar movimiento' });
            
            const operacion = tipo === 'entrada'? '+' : '-';
            db.query(`UPDATE productos SET stock_actual = stock_actual ${operacion}? WHERE id =?`, 
                [cantidad, producto_id], 
                (err2) => {
                    if (err2) return res.json({ success: false, message: 'Error al actualizar stock' });
                    res.json({ success: true });
                });
        });
});

// === RUTAS CLIENTES ===
app.get('/api/clientes', (req, res) => {
    const { user } = req.query;
    if (user!== 'Reyna_34142') return res.status(403).json({ error: 'Acceso denegado' });
    
    db.query('SELECT * FROM clientes_pasteleria WHERE owner_username =? ORDER BY nombre', [user], (err, results) => {
        if (err) return res.status(500).json({ error: 'Error en el servidor' });
        res.json(results);
    });
});

app.post('/api/clientes', (req, res) => {
    const { user } = req.query;
    if (user!== 'Reyna_34142') return res.status(403).json({ error: 'Acceso denegado' });
    
    const { nombre, telefono, email, domicilio } = req.body;
    db.query('INSERT INTO clientes_pasteleria (nombre, telefono, email, domicilio, owner_username) VALUES (?,?,?,?,?)', 
        [nombre, telefono, email, domicilio, user], 
        (err, result) => {
            if (err) return res.json({ success: false, message: 'Error al crear cliente' });
            res.json({ success: true, id: result.insertId });
        });
});

// === RUTAS PEDIDOS ===
app.get('/api/pedidos', (req, res) => {
    const { user, entregado } = req.query;
    if (user!== 'Reyna_34142') return res.status(403).json({ error: 'Acceso denegado' });
    
    const sql = `SELECT p.*, c.nombre as cliente_nombre 
                 FROM pedidos_pasteleria p 
                 JOIN clientes_pasteleria c ON p.cliente_id = c.id 
                 WHERE p.owner_username =? AND p.entregado =?
                 ORDER BY p.fecha_programada ASC`;
    
    db.query(sql, [user, entregado || 0], (err, results) => {
        if (err) return res.status(500).json({ error: 'Error en el servidor' });
        res.json(results);
    });
});

app.post('/api/pedidos', (req, res) => {
    const { user } = req.query;
    if (user!== 'Reyna_34142') return res.status(403).json({ error: 'Acceso denegado' });
    
    const { cliente_id, tamanio_pastel, fecha_programada, domicilio_entrega, telefono, email, pagado, anticipo, total, descripcion } = req.body;
    
    db.query(`INSERT INTO pedidos_pasteleria 
        (cliente_id, tamanio_pastel, fecha_programada, domicilio_entrega, telefono, email, pagado, anticipo, total, descripcion, owner_username) 
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`, 
        [cliente_id, tamanio_pastel, fecha_programada, domicilio_entrega, telefono, email, pagado, anticipo, total, descripcion, user], 
        (err, result) => {
            if (err) return res.json({ success: false, message: 'Error al crear pedido' });
            res.json({ success: true, id: result.insertId });
        });
});

app.put('/api/pedidos/:id', (req, res) => {
    const { user } = req.query;
    if (user!== 'Reyna_34142') return res.status(403).json({ error: 'Acceso denegado' });
    
    const { cliente_id, tamanio_pastel, fecha_programada, domicilio_entrega, telefono, email, pagado, anticipo, total, descripcion, entregado } = req.body;
    
    db.query(`UPDATE pedidos_pasteleria SET 
        cliente_id=?, tamanio_pastel=?, fecha_programada=?, domicilio_entrega=?, telefono=?, 
        email=?, pagado=?, anticipo=?, total=?, descripcion=?, entregado=?
        WHERE id=? AND owner_username=?`, 
        [cliente_id, tamanio_pastel, fecha_programada, domicilio_entrega, telefono, email, pagado, anticipo, total, descripcion, entregado, req.params.id, user], 
        (err) => {
            if (err) return res.json({ success: false, message: 'Error al modificar' });
            res.json({ success: true });
        });
});

app.delete('/api/pedidos/:id', (req, res) => {
    const { user } = req.query;
    if (user!== 'Reyna_34142') return res.status(403).json({ error: 'Acceso denegado' });
    
    db.query('DELETE FROM pedidos_pasteleria WHERE id=? AND owner_username=?', [req.params.id, user], (err) => {
        if (err) return res.json({ success: false, message: 'Error al eliminar' });
        res.json({ success: true });
    });
});
// === RUTA PEDIDOS REYNA ===
app.get('/PedidosReyna', (req, res) => {
    const { user } = req.query;
    if (user!== 'Reyna_34142') {
        return res.status(403).send('Acceso denegado');
    }
    res.sendFile(path.join(__dirname, 'public', 'PedidosReyna.html'));
});

// === CRUD CLIENTES ===
app.get('/api/clientes', (req, res) => {
    const { user } = req.query;
    if (user!== 'Reyna_34142') return res.status(403).json({ error: 'Acceso denegado' });
    
    db.query('SELECT * FROM clientes_pasteleria WHERE owner_username =? ORDER BY nombre', [user], (err, results) => {
        if (err) return res.status(500).json({ error: 'Error en el servidor' });
        res.json(results);
    });
});

app.post('/api/clientes', (req, res) => {
    const { user } = req.query;
    if (user!== 'Reyna_34142') return res.status(403).json({ error: 'Acceso denegado' });
    
    const { nombre, telefono, email, domicilio } = req.body;
    db.query('INSERT INTO clientes_pasteleria (nombre, telefono, email, domicilio, owner_username) VALUES (?,?,?,?,?)', 
        [nombre, telefono, email, domicilio, user], 
        (err, result) => {
            if (err) return res.json({ success: false, message: 'Error al crear cliente' });
            res.json({ success: true, id: result.insertId });
        });
});

app.put('/api/clientes/:id', (req, res) => {
    const { user } = req.query;
    if (user!== 'Reyna_34142') return res.status(403).json({ error: 'Acceso denegado' });
    
    const { nombre, telefono, email, domicilio } = req.body;
    db.query('UPDATE clientes_pasteleria SET nombre=?, telefono=?, email=?, domicilio=? WHERE id=? AND owner_username=?', 
        [nombre, telefono, email, domicilio, req.params.id, user], 
        (err) => {
            if (err) return res.json({ success: false, message: 'Error al modificar' });
            res.json({ success: true });
        });
});

app.delete('/api/clientes/:id', (req, res) => {
    const { user } = req.query;
    if (user!== 'Reyna_34142') return res.status(403).json({ error: 'Acceso denegado' });
    
    db.query('DELETE FROM clientes_pasteleria WHERE id=? AND owner_username=?', [req.params.id, user], (err) => {
        if (err) return res.json({ success: false, message: 'Error al eliminar' });
        res.json({ success: true });
    });
});

// === CRUD PEDIDOS ===
app.get('/api/pedidos', (req, res) => {
    const { user, entregado } = req.query;
    if (user!== 'Reyna_34142') return res.status(403).json({ error: 'Acceso denegado' });
    
    const sql = `SELECT p.*, c.nombre as cliente_nombre 
                 FROM pedidos_pasteleria p 
                 JOIN clientes_pasteleria c ON p.cliente_id = c.id 
                 WHERE p.owner_username =? AND p.entregado =?
                 ORDER BY p.fecha_programada ASC`;
    
    db.query(sql, [user, entregado || 0], (err, results) => {
        if (err) return res.status(500).json({ error: 'Error en el servidor' });
        res.json(results);
    });
});

app.post('/api/pedidos', (req, res) => {
    const { user } = req.query;
    if (user!== 'Reyna_34142') return res.status(403).json({ error: 'Acceso denegado' });
    
    const { cliente_id, tamanio_pastel, fecha_programada, domicilio_entrega, telefono, email, pagado, anticipo, total, descripcion } = req.body;
    
    db.query(`INSERT INTO pedidos_pasteleria 
        (cliente_id, tamanio_pastel, fecha_programada, domicilio_entrega, telefono, email, pagado, anticipo, total, descripcion, owner_username) 
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`, 
        [cliente_id, tamanio_pastel, fecha_programada, domicilio_entrega, telefono, email, pagado, anticipo, total, descripcion, user], 
        (err, result) => {
            if (err) return res.json({ success: false, message: 'Error al crear pedido' });
            res.json({ success: true, id: result.insertId });
        });
});

app.put('/api/pedidos/:id', (req, res) => {
    const { user } = req.query;
    if (user!== 'Reyna_34142') return res.status(403).json({ error: 'Acceso denegado' });
    
    const { cliente_id, tamanio_pastel, fecha_programada, domicilio_entrega, telefono, email, pagado, anticipo, total, descripcion, entregado } = req.body;
    
    db.query(`UPDATE pedidos_pasteleria SET 
        cliente_id=?, tamanio_pastel=?, fecha_programada=?, domicilio_entrega=?, telefono=?, 
        email=?, pagado=?, anticipo=?, total=?, descripcion=?, entregado=?
        WHERE id=? AND owner_username=?`, 
        [cliente_id, tamanio_pastel, fecha_programada, domicilio_entrega, telefono, email, pagado, anticipo, total, descripcion, entregado, req.params.id, user], 
        (err) => {
            if (err) return res.json({ success: false, message: 'Error al modificar' });
            res.json({ success: true });
        });
});

app.delete('/api/pedidos/:id', (req, res) => {
    const { user } = req.query;
    if (user!== 'Reyna_34142') return res.status(403).json({ error: 'Acceso denegado' });
    
    db.query('DELETE FROM pedidos_pasteleria WHERE id=? AND owner_username=?', [req.params.id, user], (err) => {
        if (err) return res.json({ success: false, message: 'Error al eliminar' });
        res.json({ success: true });
    });
});
// === RUTA PEDIDOS REYNA ===
app.get('/PedidosReyna', (req, res) => {
    const { user } = req.query;
    if (user!== 'Reyna_34142') {
        return res.status(403).send('Acceso denegado');
    }
    res.sendFile(path.join(__dirname, 'public', 'PedidosReyna.html'));
});

// === CRUD CLIENTES ===
app.get('/api/clientes', (req, res) => {
    const { user } = req.query;
    if (user!== 'Reyna_34142') return res.status(403).json({ error: 'Acceso denegado' });
    
    db.query('SELECT * FROM clientes_pasteleria WHERE owner_username =? ORDER BY nombre', [user], (err, results) => {
        if (err) return res.status(500).json({ error: 'Error en el servidor' });
        res.json(results);
    });
});

app.post('/api/clientes', (req, res) => {
    const { user } = req.query;
    if (user!== 'Reyna_34142') return res.status(403).json({ error: 'Acceso denegado' });
    
    const { nombre, telefono, email, domicilio } = req.body;
    db.query('INSERT INTO clientes_pasteleria (nombre, telefono, email, domicilio, owner_username) VALUES (?,?,?,?,?)', 
        [nombre, telefono, email, domicilio, user], 
        (err, result) => {
            if (err) return res.json({ success: false, message: 'Error al crear cliente' });
            res.json({ success: true, id: result.insertId });
        });
});

app.put('/api/clientes/:id', (req, res) => {
    const { user } = req.query;
    if (user!== 'Reyna_34142') return res.status(403).json({ error: 'Acceso denegado' });
    
    const { nombre, telefono, email, domicilio } = req.body;
    db.query('UPDATE clientes_pasteleria SET nombre=?, telefono=?, email=?, domicilio=? WHERE id=? AND owner_username=?', 
        [nombre, telefono, email, domicilio, req.params.id, user], 
        (err) => {
            if (err) return res.json({ success: false, message: 'Error al modificar' });
            res.json({ success: true });
        });
});

app.delete('/api/clientes/:id', (req, res) => {
    const { user } = req.query;
    if (user!== 'Reyna_34142') return res.status(403).json({ error: 'Acceso denegado' });
    
    db.query('DELETE FROM clientes_pasteleria WHERE id=? AND owner_username=?', [req.params.id, user], (err) => {
        if (err) return res.json({ success: false, message: 'Error al eliminar' });
        res.json({ success: true });
    });
});

// === CRUD PEDIDOS ===
app.get('/api/pedidos', (req, res) => {
    const { user, entregado } = req.query;
    if (user!== 'Reyna_34142') return res.status(403).json({ error: 'Acceso denegado' });
    
    const sql = `SELECT p.*, c.nombre as cliente_nombre 
                 FROM pedidos_pasteleria p 
                 JOIN clientes_pasteleria c ON p.cliente_id = c.id 
                 WHERE p.owner_username =? AND p.entregado =?
                 ORDER BY p.fecha_programada ASC`;
    
    db.query(sql, [user, entregado || 0], (err, results) => {
        if (err) return res.status(500).json({ error: 'Error en el servidor' });
        res.json(results);
    });
});

app.post('/api/pedidos', (req, res) => {
    const { user } = req.query;
    if (user!== 'Reyna_34142') return res.status(403).json({ error: 'Acceso denegado' });
    
    const { cliente_id, tamanio_pastel, fecha_programada, domicilio_entrega, telefono, email, pagado, anticipo, total, descripcion } = req.body;
    
    db.query(`INSERT INTO pedidos_pasteleria 
        (cliente_id, tamanio_pastel, fecha_programada, domicilio_entrega, telefono, email, pagado, anticipo, total, descripcion, owner_username) 
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`, 
        [cliente_id, tamanio_pastel, fecha_programada, domicilio_entrega, telefono, email, pagado, anticipo, total, descripcion, user], 
        (err, result) => {
            if (err) return res.json({ success: false, message: 'Error al crear pedido' });
            res.json({ success: true, id: result.insertId });
        });
});

app.put('/api/pedidos/:id', (req, res) => {
    const { user } = req.query;
    if (user!== 'Reyna_34142') return res.status(403).json({ error: 'Acceso denegado' });
    
    const { cliente_id, tamanio_pastel, fecha_programada, domicilio_entrega, telefono, email, pagado, anticipo, total, descripcion, entregado } = req.body;
    
    db.query(`UPDATE pedidos_pasteleria SET 
        cliente_id=?, tamanio_pastel=?, fecha_programada=?, domicilio_entrega=?, telefono=?, 
        email=?, pagado=?, anticipo=?, total=?, descripcion=?, entregado=?
        WHERE id=? AND owner_username=?`, 
        [cliente_id, tamanio_pastel, fecha_programada, domicilio_entrega, telefono, email, pagado, anticipo, total, descripcion, entregado, req.params.id, user], 
        (err) => {
            if (err) return res.json({ success: false, message: 'Error al modificar' });
            res.json({ success: true });
        });
});

app.delete('/api/pedidos/:id', (req, res) => {
    const { user } = req.query;
    if (user!== 'Reyna_34142') return res.status(403).json({ error: 'Acceso denegado' });
    
    db.query('DELETE FROM pedidos_pasteleria WHERE id=? AND owner_username=?', [req.params.id, user], (err) => {
        if (err) return res.json({ success: false, message: 'Error al eliminar' });
        res.json({ success: true });
    });
});
// === SISTEMA JAGUAR - RUTAS CON VALIDACIÓN ===
app.get('/jaguar.html', (req, res) => {
    if (req.query.user!== 'Cris') return res.status(403).send('Acceso denegado');
    res.sendFile(path.join(__dirname, 'public', 'jaguar.html'));
});

app.get('/jaguar-movimientos.html', (req, res) => {
    if (req.query.user!== 'Cris') return res.status(403).send('Acceso denegado');
    res.sendFile(path.join(__dirname, 'public', 'jaguar-movimientos.html'));
});

app.get('/jaguar-cotizacion.html', (req, res) => {
    if (req.query.user!== 'Cris') return res.status(403).send('Acceso denegado');
    res.sendFile(path.join(__dirname, 'public', 'jaguar-cotizacion.html'));
});

app.get('/jaguar-clientes.html', (req, res) => {
    if (req.query.user!== 'Cris') return res.status(403).send('Acceso denegado');
    res.sendFile(path.join(__dirname, 'public', 'jaguar-clientes.html'));
});

// SECCIONES JAGUAR
app.get('/api/jaguar/secciones', (req, res) => {
    const { user, search } = req.query;
    if (user!== 'Cris') return res.status(403).json({ error: 'Acceso denegado' });
    
    let sql = 'SELECT * FROM jaguar_secciones WHERE owner_username =?';
    let params = [user];
    
    if (search) {
        sql += ' AND (nombre LIKE? OR codigo LIKE?)';
        const s = `%${search}%`;
        params.push(s, s);
    }
    sql += ' ORDER BY nombre';
    
    db.query(sql, params, (err, results) => {
        if (err) return res.status(500).json({ error: 'Error en el servidor' });
        res.json(results);
    });
});

app.post('/api/jaguar/secciones', (req, res) => {
    const { user } = req.query;
    if (user!== 'Cris') return res.status(403).json({ error: 'Acceso denegado' });
    
    const { nombre, codigo } = req.body;
    db.query('INSERT INTO jaguar_secciones (nombre, codigo, owner_username) VALUES (?,?,?)', 
        [nombre, codigo, user], 
        (err, result) => {
            if (err) return res.json({ success: false, message: 'Error al crear sección' });
            res.json({ success: true, id: result.insertId });
        });
});

app.put('/api/jaguar/secciones/:id', (req, res) => {
    const { user } = req.query;
    if (user!== 'Cris') return res.status(403).json({ error: 'Acceso denegado' });
    
    const { nombre, codigo } = req.body;
    db.query('UPDATE jaguar_secciones SET nombre=?, codigo=? WHERE id=? AND owner_username=?', 
        [nombre, codigo, req.params.id, user], 
        (err) => {
            if (err) return res.json({ success: false, message: 'Error al modificar' });
            res.json({ success: true });
        });
});

app.delete('/api/jaguar/secciones/:id', (req, res) => {
    const { user } = req.query;
    if (user!== 'Cris') return res.status(403).json({ error: 'Acceso denegado' });
    
    db.query('DELETE FROM jaguar_secciones WHERE id=? AND owner_username=?', [req.params.id, user], (err) => {
        if (err) return res.json({ success: false, message: 'Error al eliminar. Borra primero los productos.' });
        res.json({ success: true });
    });
});

// CLIENTES JAGUAR - completo
app.get('/api/jaguar/clientes', (req, res) => {
    const { user, search } = req.query;
    if (user!== 'Cris') return res.status(403).json({ error: 'Acceso denegado' });
    
    let sql = 'SELECT * FROM jaguar_clientes WHERE owner_username =?';
    let params = [user];
    
    if (search) {
        sql += ' AND (nombre LIKE? OR rfc LIKE? OR email LIKE?)';
        const s = `%${search}%`;
        params.push(s, s, s);
    }
    sql += ' ORDER BY nombre';
    
    db.query(sql, params, (err, results) => {
        if (err) return res.status(500).json({ error: 'Error en el servidor' });
        res.json(results);
    });
});

app.post('/api/jaguar/clientes', (req, res) => {
    const { user } = req.query;
    if (user!== 'Cris') return res.status(403).json({ error: 'Acceso denegado' });
    
    const { nombre, rfc, telefono, email, domicilio, ciudad, estado, cp, regimen_fiscal } = req.body;
    
    db.query(`INSERT INTO jaguar_clientes 
        (nombre, rfc, telefono, email, domicilio, ciudad, estado, cp, regimen_fiscal, owner_username) 
        VALUES (?,?,?,?,?,?,?,?,?,?)`, 
        [nombre, rfc, telefono, email, domicilio, ciudad, estado, cp, regimen_fiscal, user], 
        (err, result) => {
            if (err) return res.json({ success: false, message: 'Error al crear cliente' });
            res.json({ success: true, id: result.insertId });
        });
});

app.put('/api/jaguar/clientes/:id', (req, res) => {
    const { user } = req.query;
    if (user!== 'Cris') return res.status(403).json({ error: 'Acceso denegado' });
    
    const { nombre, rfc, telefono, email, domicilio, ciudad, estado, cp, regimen_fiscal } = req.body;
    db.query(`UPDATE jaguar_clientes SET nombre=?, rfc=?, telefono=?, email=?, domicilio=?, 
              ciudad=?, estado=?, cp=?, regimen_fiscal=? WHERE id=? AND owner_username=?`, 
        [nombre, rfc, telefono, email, domicilio, ciudad, estado, cp, regimen_fiscal, req.params.id, user], 
        (err) => {
            if (err) return res.json({ success: false, message: 'Error al modificar' });
            res.json({ success: true });
        });
});

app.delete('/api/jaguar/clientes/:id', (req, res) => {
    const { user } = req.query;
    if (user!== 'Cris') return res.status(403).json({ error: 'Acceso denegado' });
    
    db.query('DELETE FROM jaguar_clientes WHERE id=? AND owner_username=?', [req.params.id, user], (err) => {
        if (err) return res.json({ success: false, message: 'Error al eliminar' });
        res.json({ success: true });
    });
});

// PROVEEDORES JAGUAR
app.get('/api/jaguar/proveedores', (req, res) => {
    const { user, search } = req.query;
    if (user!== 'Cris') return res.status(403).json({ error: 'Acceso denegado' });
    
    let sql = 'SELECT * FROM jaguar_proveedores WHERE owner_username =?';
    let params = [user];
    
    if (search) {
        sql += ' AND (nombre LIKE? OR email LIKE?)';
        const s = `%${search}%`;
        params.push(s, s);
    }
    sql += ' ORDER BY nombre';
    
    db.query(sql, params, (err, results) => {
        if (err) return res.status(500).json({ error: 'Error en el servidor' });
        res.json(results);
    });
});

app.post('/api/jaguar/proveedores', (req, res) => {
    const { user } = req.query;
    if (user!== 'Cris') return res.status(403).json({ error: 'Acceso denegado' });
    
    const { nombre, telefono, email, direccion } = req.body;
    db.query('INSERT INTO jaguar_proveedores (nombre, telefono, email, direccion, owner_username) VALUES (?,?,?,?,?)', 
        [nombre, telefono, email, direccion, user], 
        (err, result) => {
            if (err) return res.json({ success: false, message: 'Error al crear proveedor' });
            res.json({ success: true, id: result.insertId });
        });
});

app.put('/api/jaguar/proveedores/:id', (req, res) => {
    const { user } = req.query;
    if (user!== 'Cris') return res.status(403).json({ error: 'Acceso denegado' });
    
    const { nombre, telefono, email, direccion } = req.body;
    db.query('UPDATE jaguar_proveedores SET nombre=?, telefono=?, email=?, direccion=? WHERE id=? AND owner_username=?', 
        [nombre, telefono, email, direccion, req.params.id, user], 
        (err) => {
            if (err) return res.json({ success: false, message: 'Error al modificar' });
            res.json({ success: true });
        });
});

app.delete('/api/jaguar/proveedores/:id', (req, res) => {
    const { user } = req.query;
    if (user!== 'Cris') return res.status(403).json({ error: 'Acceso denegado' });
    
    db.query('DELETE FROM jaguar_proveedores WHERE id=? AND owner_username=?', [req.params.id, user], (err) => {
        if (err) return res.json({ success: false, message: 'Error al eliminar. Verifica que no tenga productos.' });
        res.json({ success: true });
    });
});

// PRODUCTOS JAGUAR - Con formato catálogo
app.get('/api/jaguar/productos', (req, res) => {
    const { user, search, seccion_id } = req.query;
    if (user!== 'Cris') return res.status(403).json({ error: 'Acceso denegado' });
    
    let sql = `SELECT p.*, prov.nombre as proveedor_nombre, s.nombre as seccion_nombre 
               FROM jaguar_productos p 
               LEFT JOIN jaguar_proveedores prov ON p.proveedor_id = prov.id 
               LEFT JOIN jaguar_secciones s ON p.seccion_id = s.id
               WHERE p.owner_username =?`;
    let params = [user];
    
    if (search) {
        sql += ` AND (p.nombre LIKE? OR p.descripcion LIKE? OR p.corta LIKE? OR s.nombre LIKE?)`;
        const s = `%${search}%`;
        params.push(s, s, s, s);
    }
    if (seccion_id) {
        sql += ` AND p.seccion_id =?`;
        params.push(seccion_id);
    }
    sql += ` ORDER BY s.nombre, p.corta, p.nombre`;
    
    db.query(sql, params, (err, results) => {
        if (err) return res.status(500).json({ error: 'Error en el servidor' });
        res.json(results);
    });
});

app.post('/api/jaguar/productos', (req, res) => {
    const { user } = req.query;
    if (user!== 'Cris') return res.status(403).json({ error: 'Acceso denegado' });
    
    const { proveedor_id, seccion_id, corta, nombre, descripcion, empaque, precio_compra, precio_venta, unidad, stock_actual, stock_minimo } = req.body;
    
    db.query(`INSERT INTO jaguar_productos 
        (proveedor_id, seccion_id, corta, nombre, descripcion, empaque, precio_compra, precio_venta, unidad, stock_actual, stock_minimo, owner_username) 
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, 
        [proveedor_id, seccion_id, corta, nombre, descripcion, empaque, precio_compra, precio_venta, unidad, stock_actual || 0, stock_minimo || 5, user], 
        (err, result) => {
            if (err) return res.json({ success: false, message: 'Error al crear producto' });
            res.json({ success: true, id: result.insertId });
        });
});

app.put('/api/jaguar/productos/:id', (req, res) => {
    const { user } = req.query;
    if (user!== 'Cris') return res.status(403).json({ error: 'Acceso denegado' });
    
    const { proveedor_id, seccion_id, corta, nombre, descripcion, empaque, precio_compra, precio_venta, unidad, stock_minimo } = req.body;
    db.query(`UPDATE jaguar_productos SET proveedor_id=?, seccion_id=?, corta=?, nombre=?, descripcion=?, empaque=?, 
              precio_compra=?, precio_venta=?, unidad=?, stock_minimo=? WHERE id=? AND owner_username=?`, 
        [proveedor_id, seccion_id, corta, nombre, descripcion, empaque, precio_compra, precio_venta, unidad, stock_minimo, req.params.id, user], 
        (err) => {
            if (err) return res.json({ success: false, message: 'Error al modificar' });
            res.json({ success: true });
        });
});

app.delete('/api/jaguar/productos/:id', (req, res) => {
    const { user } = req.query;
    if (user!== 'Cris') return res.status(403).json({ error: 'Acceso denegado' });
    
    db.query('DELETE FROM jaguar_productos WHERE id=? AND owner_username=?', [req.params.id, user], (err) => {
        if (err) return res.json({ success: false, message: 'Error al eliminar' });
        res.json({ success: true });
    });
});

// INVENTARIO MOVIMIENTO
app.post('/api/jaguar/inventario/movimiento', (req, res) => {
    const { user } = req.query;
    if (user!== 'Cris') return res.status(403).json({ error: 'Acceso denegado' });
    
    const { producto_id, tipo, cantidad, motivo } = req.body;
    
    db.query('INSERT INTO jaguar_inventario_movimientos (producto_id, tipo, cantidad, motivo, owner_username) VALUES (?,?,?,?,?)', 
        [producto_id, tipo, cantidad, motivo, user], 
        (err) => {
            if (err) return res.json({ success: false, message: 'Error al registrar movimiento' });
            
            const operacion = tipo === 'entrada'? '+' : '-';
            db.query(`UPDATE jaguar_productos SET stock_actual = stock_actual ${operacion}? WHERE id =? AND owner_username =?`, 
                [cantidad, producto_id, user], 
                (err2) => {
                    if (err2) return res.json({ success: false, message: 'Error al actualizar stock' });
                    res.json({ success: true });
                });
        });
});

// COTIZACIONES - IVA 8%
app.post('/api/jaguar/cotizacion', (req, res) => {
    const { user } = req.query;
    if (user!== 'Cris') return res.status(403).json({ error: 'Acceso denegado' });
    
    const { cliente_id, productos } = req.body;
    
    let subtotal = 0;
    const productosDetalle = [];
    
    const promises = productos.map(p => {
        return new Promise((resolve, reject) => {
            db.query('SELECT precio_venta FROM jaguar_productos WHERE id =? AND owner_username =?', 
                [p.id, user], (err, results) => {
                    if (err || results.length === 0) return reject('Producto no encontrado');
                    const precio = results[0].precio_venta;
                    subtotal += precio * p.cantidad;
                    productosDetalle.push({ producto_id: p.id, cantidad: p.cantidad, precio_unitario: precio });
                    resolve();
                });
        });
    });
    
    Promise.all(promises).then(() => {
        const iva = subtotal * 0.08; // IVA 8%
        const total = subtotal + iva;
        
        db.query('INSERT INTO jaguar_cotizaciones (cliente_id, subtotal, iva, total, owner_username) VALUES (?,?,?,?,?)',
            [cliente_id, subtotal, iva, total, user],
            (err, result) => {
                if (err) return res.json({ success: false, message: 'Error al crear cotización' });
                
                const cotizacion_id = result.insertId;
                const values = productosDetalle.map(p => [cotizacion_id, p.producto_id, p.cantidad, p.precio_unitario]);
                
                db.query('INSERT INTO jaguar_cotizaciones_detalle (cotizacion_id, producto_id, cantidad, precio_unitario) VALUES?',
                    [values], (err2) => {
                        if (err2) return res.json({ success: false, message: 'Error al guardar detalle' });
                        res.json({ success: true, id: cotizacion_id, subtotal, iva, total });
                    });
            });
    }).catch(err => {
        res.json({ success: false, message: err });
    });
});
app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
