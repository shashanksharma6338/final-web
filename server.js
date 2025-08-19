const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs").promises;
const path = require("path");
const XLSX = require("xlsx");
const session = require("express-session");
const http = require("http");
const { Server } = require("socket.io");
const pool = require("./db");
const {
    initializeAuth,
    authenticateUser,
    verifySecurityAnswer,
    changePassword,
} = require("./auth");

const app = express();
const port = process.env.PORT || 3000;
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    rolling: true, // Reset expiration on activity
    cookie: {
        secure: false, // Set to true in production with HTTPS
        httpOnly: true,
        maxAge: 30 * 60 * 1000 // 30 minutes
    }
}));

app.use(bodyParser.json());
app.use(express.static("public"));
app.use("/backups/supply", express.static("backups/supply"));
app.use("/backups/demand", express.static("backups/demand"));
app.use("/backups/bill", express.static("backups/bill"));
app.use(
    "/backups/sanction-gen-project",
    express.static("backups/sanction-gen-project"),
);
app.use("/backups/sanction-misc", express.static("backups/sanction-misc"));
app.use(
    "/backups/sanction-training",
    express.static("backups/sanction-training"),
);

// Initialize authentication system
initializeAuth();

// WebSocket authentication middleware
io.use((socket, next) => {
    const sessionId = socket.handshake.auth.sessionId;
    if (sessionId) {
        socket.sessionId = sessionId;
        next();
    } else {
        next(new Error("Authentication required"));
    }
});

// WebSocket connection handling
io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    
    socket.on("join-room", (room) => {
        socket.join(room);
        console.log(`Client ${socket.id} joined room: ${room}`);
    });
    
    socket.on("leave-room", (room) => {
        socket.leave(room);
        console.log(`Client ${socket.id} left room: ${room}`);
    });
    
    socket.on("join-gaming", () => {
        socket.join('gaming-room');
        console.log(`Client ${socket.id} joined gaming room`);
    });
    
    socket.on("leave-gaming", () => {
        socket.leave('gaming-room');
        console.log(`Client ${socket.id} left gaming room`);
    });
    
    socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
    });
});

// Helper function to broadcast data changes
function broadcastDataChange(type, action, data, financialYear) {
    const room = `${type}-${financialYear}`;
    io.to(room).emit("data-change", {
        type,
        action,
        data,
        timestamp: new Date().toISOString()
    });
}

// Middleware to check if user is authenticated
function requireAuth(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    } else {
        return res.status(401).json({ success: false, message: 'Session expired or not authenticated' });
    }
}

// Middleware to check admin role
function requireAdmin(req, res, next) {
    if (req.session && req.session.user && req.session.user.role === 'admin') {
        return next();
    } else {
        return res.status(403).json({ success: false, message: 'Admin access required' });
    }
}

// Create backup directories if they don't exist
const backupDirs = {
    supply: path.join(__dirname, "backups", "supply"),
    demand: path.join(__dirname, "backups", "demand"),
    bill: path.join(__dirname, "backups", "bill"),
    "sanction-gen-project": path.join(
        __dirname,
        "backups",
        "sanction-gen-project",
    ),
    "sanction-misc": path.join(__dirname, "backups", "sanction-misc"),
    "sanction-training": path.join(__dirname, "backups", "sanction-training"),
};
Object.values(backupDirs).forEach((dir) => fs.mkdir(dir, { recursive: true }));

// Auto-generate backup daily
async function createBackup(type) {
    const date = new Date().toISOString().split("T")[0];
    const backupFile = path.join(backupDirs[type], `backup_${date}.xlsx`);
    try {
        let tableName, sheetName;
        if (type.startsWith("sanction-")) {
            tableName = type.replace(/-/g, "_");
            sheetName = `${type.charAt(0).toUpperCase() + type.slice(1)} Codes`;
        } else {
            tableName = `${type}_orders`;
            sheetName = `${type.charAt(0).toUpperCase() + type.slice(1)} Orders`;
        }

        const [rows] = await pool.query(`SELECT * FROM ${tableName}`);
        const formattedRows = rows.map((row) => ({
            ...row,
            ...(type === "supply"
                ? {
                      original_date: row.original_date
                          ? row.original_date.toISOString().split("T")[0]
                          : "",
                      revised_date1: row.revised_date1
                          ? row.revised_date1.toISOString().split("T")[0]
                          : "",
                      revised_date2: row.revised_date2
                          ? row.revised_date2.toISOString().split("T")[0]
                          : "",
                      revised_date3: row.revised_date3
                          ? row.revised_date3.toISOString().split("T")[0]
                          : "",
                      actual_delivery_date: row.actual_delivery_date
                          ? row.actual_delivery_date.toISOString().split("T")[0]
                          : "",
                  }
                : type === "demand"
                  ? {
                        demand_date: row.demand_date
                            ? row.demand_date.toISOString().split("T")[0]
                            : "",
                        control_date: row.control_date
                            ? row.control_date.toISOString().split("T")[0]
                            : "",
                    }
                  : type === "bill"
                    ? {
                          bill_control_date: row.bill_control_date
                              ? row.bill_control_date
                                    .toISOString()
                                    .split("T")[0]
                              : "",
                          so_date: row.so_date
                              ? row.so_date.toISOString().split("T")[0]
                              : "",
                      }
                    : type.startsWith("sanction-")
                      ? {
                            date: row.date
                                ? row.date.toISOString().split("T")[0]
                                : "",
                            uo_date: row.uo_date
                                ? row.uo_date.toISOString().split("T")[0]
                                : "",
                        }
                      : {}),
        }));
        const worksheet = XLSX.utils.json_to_sheet(formattedRows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        await fs.writeFile(
            backupFile,
            XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }),
        );

        // Delete backups older than 10 days
        const files = await fs.readdir(backupDirs[type]);
        const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
        for (const file of files) {
            const filePath = path.join(backupDirs[type], file);
            const stats = await fs.stat(filePath);
            if (stats.mtime < tenDaysAgo) {
                await fs.unlink(filePath);
            }
        }
    } catch (error) {
        console.error(`Error creating ${type} backup:`, error);
    }
}

// Schedule backups every day at midnight
setInterval(() => createBackup("supply"), 24 * 60 * 60 * 1000);
setInterval(() => createBackup("demand"), 24 * 60 * 60 * 1000);
setInterval(() => createBackup("bill"), 24 * 60 * 60 * 1000);
setInterval(() => createBackup("sanction-gen-project"), 24 * 60 * 60 * 1000);
setInterval(() => createBackup("sanction-misc"), 24 * 60 * 60 * 1000);
setInterval(() => createBackup("sanction-training"), 24 * 60 * 60 * 1000);
createBackup("supply"); // Run immediately on startup
createBackup("demand");
createBackup("bill");
createBackup("sanction-gen-project");
createBackup("sanction-misc");
createBackup("sanction-training");

// Authentication endpoints
app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await authenticateUser(username, password);

        if (user) {
            // Create session
            req.session.user = {
                id: user.id,
                username: user.username,
                role: user.role || 'viewer'
            };

            res.status(200).json({
                success: true,
                message: "Login successful",
                user: {
                    username: user.username,
                    role: user.role || 'viewer'
                }
            });
        } else {
            res.status(401).json({
                success: false,
                message: "Invalid credentials",
            });
        }
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// Gaming endpoints - only accessible with gaming credentials
app.get("/api/chess/games", requireAuth, (req, res) => {
    if (req.session.user.role !== 'gamer') {
        return res.status(403).json({ success: false, message: 'Gaming access required' });
    }
    
    // Return list of active games
    const games = Array.from(chessGames.values()).map(game => ({
        id: game.id,
        players: game.players,
        status: game.status,
        turn: game.turn,
        createdAt: game.createdAt
    }));
    
    res.json(games);
});

app.post("/api/chess/create", requireAuth, (req, res) => {
    if (req.session.user.role !== 'gamer') {
        return res.status(403).json({ success: false, message: 'Gaming access required' });
    }
    
    const gameId = Date.now().toString();
    const newGame = {
        id: gameId,
        players: [req.session.user.username],
        board: initializeChessBoard(),
        turn: 'white',
        status: 'waiting',
        moves: [],
        createdAt: new Date().toISOString()
    };
    
    chessGames.set(gameId, newGame);
    
    res.json({ success: true, gameId, game: newGame });
});

app.post("/api/chess/join/:gameId", requireAuth, (req, res) => {
    if (req.session.user.role !== 'gamer') {
        return res.status(403).json({ success: false, message: 'Gaming access required' });
    }
    
    const { gameId } = req.params;
    const game = chessGames.get(gameId);
    
    if (!game) {
        return res.status(404).json({ success: false, message: 'Game not found' });
    }
    
    if (game.players.length >= 2) {
        return res.status(400).json({ success: false, message: 'Game is full' });
    }
    
    if (game.players.includes(req.session.user.username)) {
        return res.status(400).json({ success: false, message: 'Already in this game' });
    }
    
    game.players.push(req.session.user.username);
    game.status = 'playing';
    
    // Broadcast game update to all gaming clients
    io.to('gaming-room').emit('game-updated', { gameId, game });
    
    res.json({ success: true, game });
});

app.post("/api/chess/move", requireAuth, (req, res) => {
    if (req.session.user.role !== 'gamer') {
        return res.status(403).json({ success: false, message: 'Gaming access required' });
    }
    
    const { gameId, from, to } = req.body;
    const game = chessGames.get(gameId);
    
    if (!game) {
        return res.status(404).json({ success: false, message: 'Game not found' });
    }
    
    if (!game.players.includes(req.session.user.username)) {
        return res.status(403).json({ success: false, message: 'Not a player in this game' });
    }
    
    // Determine player color
    const playerColor = game.players[0] === req.session.user.username ? 'white' : 'black';
    
    if (game.turn !== playerColor) {
        return res.status(400).json({ success: false, message: 'Not your turn' });
    }
    
    // Validate and make move
    if (isValidMove(game.board, from, to, playerColor)) {
        makeMove(game.board, from, to);
        game.moves.push({ from, to, player: req.session.user.username, timestamp: new Date().toISOString() });
        game.turn = game.turn === 'white' ? 'black' : 'white';
        
        // Check for game end conditions
        if (isCheckmate(game.board, game.turn)) {
            game.status = 'finished';
            game.winner = playerColor;
        } else if (isStalemate(game.board, game.turn)) {
            game.status = 'draw';
        }
        
        // Broadcast move to all gaming clients
        io.to('gaming-room').emit('move-made', { gameId, move: { from, to }, game });
        
        res.json({ success: true, game });
    } else {
        res.status(400).json({ success: false, message: 'Invalid move' });
    }
});

// Chess game storage
const chessGames = new Map();

// Chess game logic functions
function initializeChessBoard() {
    return [
        ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
        ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
        [null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null],
        ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
        ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
    ];
}

function isValidMove(board, from, to, playerColor) {
    const [fromRow, fromCol] = [parseInt(from[1]), from.charCodeAt(0) - 97];
    const [toRow, toCol] = [parseInt(to[1]), to.charCodeAt(0) - 97];
    
    // Basic bounds checking
    if (fromRow < 0 || fromRow > 7 || fromCol < 0 || fromCol > 7 ||
        toRow < 0 || toRow > 7 || toCol < 0 || toCol > 7) {
        return false;
    }
    
    const piece = board[7 - fromRow][fromCol];
    if (!piece) return false;
    
    // Check if piece belongs to current player
    const pieceColor = piece === piece.toUpperCase() ? 'white' : 'black';
    if (pieceColor !== playerColor) return false;
    
    // Basic move validation (simplified)
    return true;
}

function makeMove(board, from, to) {
    const [fromRow, fromCol] = [7 - parseInt(from[1]), from.charCodeAt(0) - 97];
    const [toRow, toCol] = [7 - parseInt(to[1]), to.charCodeAt(0) - 97];
    
    board[toRow][toCol] = board[fromRow][fromCol];
    board[fromRow][fromCol] = null;
}

function isCheckmate(board, color) {
    // Simplified checkmate detection
    return false;
}

function isStalemate(board, color) {
    // Simplified stalemate detection
    return false;
}

// Logout endpoint
app.post("/api/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ success: false, message: "Could not log out" });
        }
        res.clearCookie('connect.sid');
        res.status(200).json({ success: true, message: "Logged out successfully" });
    });
});

// Check session status
app.get("/api/session", (req, res) => {
    if (req.session && req.session.user) {
        res.status(200).json({
            success: true,
            user: req.session.user
        });
    } else {
        res.status(401).json({ success: false, message: "No active session" });
    }
});

// Extend session
app.post("/api/extend-session", requireAuth, (req, res) => {
    req.session.touch(); // This resets the session timeout
    res.status(200).json({ success: true, message: "Session extended" });
});

app.post("/api/verify-security", async (req, res) => {
    const { username, answer } = req.body;

    try {
        const isValid = await verifySecurityAnswer(username, answer);
        if (isValid) {
            res.status(200).json({ success: true });
        } else {
            res.status(400).json({ success: false, message: "Incorrect answer. Please try again." });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "Verification failed. Please try again." });
    }
});

app.post("/api/change-password", async (req, res) => {
    const { username, newPassword } = req.body;

    try {
        await changePassword(username, newPassword);
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

app.get("/api/supply-orders", requireAuth, async (req, res) => {
    const { year, sort = "serial_no" } = req.query;
    
    // Whitelist allowed sort columns to prevent SQL injection
    const allowedSortColumns = [
        "serial_no", "supply_order_no_date", "firm_name", "nomenclature", 
        "quantity", "original_date", "revised_date1", "revised_date2", 
        "revised_date3", "build_up", "maint", "misc", "project_no_pdc", 
        "actual_delivery_date", "procurement_mode", "delivery_done", "remarks"
    ];
    
    const safeSort = allowedSortColumns.includes(sort) ? sort : "serial_no";
    
    try {
        const [rows] = await pool.query(
            `SELECT id, serial_no, supply_order_no_date, firm_name, nomenclature, quantity, 
                    DATE_FORMAT(original_date, '%Y-%m-%d') as original_date, 
                    DATE_FORMAT(revised_date1, '%Y-%m-%d') as revised_date1, 
                    DATE_FORMAT(revised_date2, '%Y-%m-%d') as revised_date2, 
                    DATE_FORMAT(revised_date3, '%Y-%m-%d') as revised_date3, 
                    build_up, maint, misc, project_no_pdc, p_np, expenditure_head, rev_cap,
                    DATE_FORMAT(actual_delivery_date, '%Y-%m-%d') as actual_delivery_date,
                    procurement_mode, delivery_done, remarks, financial_year 
             FROM supply_orders WHERE financial_year = ? ORDER BY ${safeSort}`,
            [year],
        );
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch supply orders" });
    }
});

app.get("/api/demand-orders", requireAuth, async (req, res) => {
    const { year, sort = "serial_no" } = req.query;
    
    const allowedSortColumns = [
        "serial_no", "demand_date", "group_demand_no", "mmg_control_no", 
        "nomenclature", "quantity", "expenditure_head", "rev_cap", 
        "procurement_mode", "est_cost", "imms_control_no", "remarks"
    ];
    
    const safeSort = allowedSortColumns.includes(sort) ? sort : "serial_no";
    
    try {
        const [rows] = await pool.query(
            `SELECT id, serial_no, group_demand_no, DATE_FORMAT(demand_date, '%Y-%m-%d') as demand_date, 
                    mmg_control_no, DATE_FORMAT(control_date, '%Y-%m-%d') as control_date, nomenclature, quantity, 
                    expenditure_head, code_head, rev_cap, procurement_mode, est_cost, imms_control_no, remarks, financial_year 
             FROM demand_orders WHERE financial_year = ? ORDER BY ${safeSort}`,
            [year],
        );
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch demand orders" });
    }
});

app.get("/api/bill-orders", requireAuth, async (req, res) => {
    const { year, sort = "serial_no" } = req.query;
    
    const allowedSortColumns = [
        "serial_no", "bill_control_date", "firm_name", "supply_order_no", 
        "so_date", "project_no", "build_up", "maintenance", "project_less_2cr", 
        "project_more_2cr", "procurement_mode", "rev_cap", "date_amount_passed", 
        "ld_amount", "remarks"
    ];
    
    const safeSort = allowedSortColumns.includes(sort) ? sort : "serial_no";
    
    try {
        const [rows] = await pool.query(
            `SELECT id, serial_no, DATE_FORMAT(bill_control_date, '%Y-%m-%d') as bill_control_date, 
                    firm_name, supply_order_no, DATE_FORMAT(so_date, '%Y-%m-%d') as so_date, 
                    project_no, build_up, maintenance, project_less_2cr, project_more_2cr, 
                    procurement_mode, rev_cap, date_amount_passed, ld_amount, remarks, financial_year 
             FROM bill_orders WHERE financial_year = ? ORDER BY ${safeSort}`,
            [year],
        );
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch bill orders" });
    }
});

app.get("/api/supply-orders/max-serial", async (req, res) => {
    const { year } = req.query;
    try {
        const [rows] = await pool.query(
            "SELECT MAX(serial_no) as maxSerialNo FROM supply_orders WHERE financial_year = ?",
            [year],
        );
        res.json({ maxSerialNo: rows[0].maxSerialNo || 0 });
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.get("/api/demand-orders/max-serial", async (req, res) => {
    const { year } = req.query;
    try {
        const [rows] = await pool.query(
            "SELECT MAX(serial_no) as maxSerialNo FROM demand_orders WHERE financial_year = ?",
            [year],
        );
        res.json({ maxSerialNo: rows[0].maxSerialNo || 0 });
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.get("/api/bill-orders/max-serial", async (req, res) => {
    const { year } = req.query;
    try {
        const [rows] = await pool.query(
            "SELECT MAX(serial_no) as maxSerialNo FROM bill_orders WHERE financial_year = ?",
            [year],
        );
        res.json({ maxSerialNo: rows[0].maxSerialNo || 0 });
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.get("/api/supply-orders/:id", async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await pool.query(
            "SELECT * FROM supply_orders WHERE id = ?",
            [id],
        );
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.status(404).send("Not found");
        }
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.get("/api/demand-orders/:id", async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await pool.query(
            "SELECT * FROM demand_orders WHERE id = ?",
            [id],
        );
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.status(404).send("Not found");
        }
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.get("/api/bill-orders/:id", async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await pool.query(
            "SELECT * FROM bill_orders WHERE id = ?",
            [id],
        );
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.status(404).send("Not found");
        }
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.post("/api/supply-orders", requireAuth, async (req, res) => {
    // Check if user has permission to add
    if (req.session.user.role === 'viewer') {
        return res.status(403).json({ success: false, message: 'Permission denied' });
    }
    const data = req.body;
    try {
        const [result] = await pool.query(
            `INSERT INTO supply_orders (serial_no, supply_order_no_date, firm_name, nomenclature, quantity, 
                original_date, revised_date1, revised_date2, revised_date3, 
                build_up, maint, misc, project_no_pdc, p_np, expenditure_head, rev_cap, actual_delivery_date,
                procurement_mode, delivery_done, remarks, financial_year) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                data.serial_no || null,
                data.supply_order_no_date || null,
                data.firm_name || null,
                data.nomenclature || null,
                data.quantity || null,
                data.original_date || null,
                data.revised_date1 || null,
                data.revised_date2 || null,
                data.revised_date3 || null,
                data.build_up || null,
                data.maint || null,
                data.misc || null,
                data.project_no_pdc || null,
                data.p_np || null,
                data.expenditure_head || null,
                data.rev_cap || null,
                data.actual_delivery_date || null,
                data.procurement_mode || null,
                data.delivery_done || null,
                data.remarks || null,
                data.financial_year || null,
            ],
        );
        
        // Broadcast the change to all connected clients
        broadcastDataChange('supply', 'create', { ...data, id: result.insertId }, data.financial_year);
        
        res.status(201).send();
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.post("/api/demand-orders", async (req, res) => {
    const data = req.body;
    try {
        await pool.query(
            `INSERT INTO demand_orders (serial_no, group_demand_no, demand_date, mmg_control_no, control_date, nomenclature, quantity, 
                expenditure_head, code_head, rev_cap, procurement_mode, est_cost, imms_control_no, remarks, financial_year) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                data.serial_no || null,
                data.group_demand_no || null,
                data.demand_date || null,
                data.mmg_control_no || null,
                data.control_date || null,
                data.nomenclature || null,
                data.quantity || null,
                data.expenditure_head || null,
                data.code_head || null,
                data.rev_cap || null,
                data.procurement_mode || null,
                data.est_cost || null,
                data.imms_control_no || null,
                data.remarks || null,
                data.financial_year || null,
            ],
        );
        res.status(201).send();
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.post("/api/bill-orders", async (req, res) => {
    const data = req.body;
    try {
        await pool.query(
            `INSERT INTO bill_orders (serial_no, bill_control_date, firm_name, supply_order_no, so_date, 
                project_no, build_up, maintenance, project_less_2cr, project_more_2cr, 
                procurement_mode, rev_cap, date_amount_passed, ld_amount, remarks, financial_year) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                data.serial_no || null,
                data.bill_control_date || null,
                data.firm_name || null,
                data.supply_order_no || null,
                data.so_date || null,
                data.project_no || null,
                data.build_up || null,
                data.maintenance || null,
                data.project_less_2cr || null,
                data.project_more_2cr || null,
                data.procurement_mode || null,
                data.rev_cap || null,
                data.date_amount_passed || null,
                data.ld_amount || null,
                data.remarks || null,
                data.financial_year || null,
            ],
        );
        res.status(201).send();
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.put("/api/supply-orders/:id", requireAuth, async (req, res) => {
    // Check if user has permission to edit
    if (req.session.user.role === 'viewer') {
        return res.status(403).json({ success: false, message: 'Permission denied' });
    }
    const { id } = req.params;
    const data = req.body;
    try {
        await pool.query(
            `UPDATE supply_orders SET serial_no = ?, supply_order_no_date = ?, firm_name = ?, nomenclature = ?, quantity = ?, 
                original_date = ?, revised_date1 = ?, revised_date2 = ?, revised_date3 = ?, 
                build_up = ?, maint = ?, misc = ?, project_no_pdc = ?, p_np = ?, expenditure_head = ?, rev_cap = ?, actual_delivery_date = ?,
                procurement_mode = ?, delivery_done = ?, remarks = ?, financial_year = ? 
             WHERE id = ?`,
            [
                data.serial_no || null,
                data.supply_order_no_date || null,
                data.firm_name || null,
                data.nomenclature || null,
                data.quantity || null,
                data.original_date || null,
                data.revised_date1 || null,
                data.revised_date2 || null,
                data.revised_date3 || null,
                data.build_up || null,
                data.maint || null,
                data.misc || null,
                data.project_no_pdc || null,
                data.p_np || null,
                data.expenditure_head || null,
                data.rev_cap || null,
                data.actual_delivery_date || null,
                data.procurement_mode || null,
                data.delivery_done || null,
                data.remarks || null,
                data.financial_year || null,
                id,
            ],
        );
        
        // Broadcast the change to all connected clients
        broadcastDataChange('supply', 'update', { ...data, id }, data.financial_year);
        
        res.status(200).send();
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.put("/api/demand-orders/:id", async (req, res) => {
    const { id } = req.params;
    const data = req.body;
    try {
        await pool.query(
            `UPDATE demand_orders SET serial_no = ?, group_demand_no = ?, demand_date = ?, mmg_control_no = ?, control_date = ?, 
                nomenclature = ?, quantity = ?, expenditure_head = ?, code_head = ?, rev_cap = ?, 
                procurement_mode = ?, est_cost = ?, imms_control_no = ?, remarks = ?, financial_year = ? 
             WHERE id = ?`,
            [
                data.serial_no || null,
                data.group_demand_no || null,
                data.demand_date || null,
                data.mmg_control_no || null,
                data.control_date || null,
                data.nomenclature || null,
                data.quantity || null,
                data.expenditure_head || null,
                data.code_head || null,
                data.rev_cap || null,
                data.procurement_mode || null,
                data.est_cost || null,
                data.imms_control_no || null,
                data.remarks || null,
                data.financial_year || null,
                id,
            ],
        );
        res.status(200).send();
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.put("/api/bill-orders/:id", async (req, res) => {
    const { id } = req.params;
    const data = req.body;
    try {
        await pool.query(
            `UPDATE bill_orders SET serial_no = ?, bill_control_date = ?, firm_name = ?, supply_order_no = ?, so_date = ?, 
                project_no = ?, build_up = ?, maintenance = ?, project_less_2cr = ?, project_more_2cr = ?, 
                procurement_mode = ?, rev_cap = ?, date_amount_passed = ?, ld_amount = ?, remarks = ?, financial_year = ? 
             WHERE id = ?`,
            [
                data.serial_no || null,
                data.bill_control_date || null,
                data.firm_name || null,
                data.supply_order_no || null,
                data.so_date || null,
                data.project_no || null,
                data.build_up || null,
                data.maintenance || null,
                data.project_less_2cr || null,
                data.project_more_2cr || null,
                data.procurement_mode || null,
                data.rev_cap || null,
                data.date_amount_passed || null,
                data.ld_amount || null,
                data.remarks || null,
                data.financial_year || null,
                id,
            ],
        );
        res.status(200).send();
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.delete("/api/supply-orders/:id", requireAuth, async (req, res) => {
    // Check if user has permission to delete
    if (req.session.user.role === 'viewer') {
        return res.status(403).json({ success: false, message: 'Permission denied' });
    }
    const { id } = req.params;
    try {
        // Get the financial year before deletion for broadcasting
        const [rows] = await pool.query("SELECT financial_year FROM supply_orders WHERE id = ?", [id]);
        const financialYear = rows[0]?.financial_year;
        
        await pool.query("DELETE FROM supply_orders WHERE id = ?", [id]);
        
        // Broadcast the change to all connected clients
        if (financialYear) {
            broadcastDataChange('supply', 'delete', { id }, financialYear);
        }
        
        res.status(200).send();
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.delete("/api/demand-orders/:id", async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query("DELETE FROM demand_orders WHERE id = ?", [id]);
        res.status(200).send();
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.delete("/api/bill-orders/:id", async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query("DELETE FROM bill_orders WHERE id = ?", [id]);
        res.status(200).send();
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.post("/api/supply-orders/move/:id", async (req, res) => {
    const { id } = req.params;
    const { direction, financial_year } = req.body;
    try {
        const [rows] = await pool.query(
            "SELECT id, serial_no FROM supply_orders WHERE financial_year = ? ORDER BY serial_no",
            [financial_year],
        );
        const currentIndex = rows.findIndex((row) => row.id == id);
        if (
            currentIndex === -1 ||
            (direction === "up" && currentIndex === 0) ||
            (direction === "down" && currentIndex === rows.length - 1)
        ) {
            return res.status(400).send("Cannot move row");
        }
        const swapIndex =
            direction === "up" ? currentIndex - 1 : currentIndex + 1;
        await pool.query(
            "UPDATE supply_orders SET serial_no = ? WHERE id = ?",
            [rows[swapIndex].serial_no, rows[currentIndex].id],
        );
        await pool.query(
            "UPDATE supply_orders SET serial_no = ? WHERE id = ?",
            [rows[currentIndex].serial_no, rows[swapIndex].id],
        );
        res.status(200).send();
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.post("/api/demand-orders/move/:id", async (req, res) => {
    const { id } = req.params;
    const { direction, financial_year } = req.body;
    try {
        const [rows] = await pool.query(
            "SELECT id, serial_no FROM demand_orders WHERE financial_year = ? ORDER BY serial_no",
            [financial_year],
        );
        const currentIndex = rows.findIndex((row) => row.id == id);
        if (
            currentIndex === -1 ||
            (direction === "up" && currentIndex === 0) ||
            (direction === "down" && currentIndex === rows.length - 1)
        ) {
            return res.status(400).send("Cannot move row");
        }
        const swapIndex =
            direction === "up" ? currentIndex - 1 : currentIndex + 1;
        await pool.query(
            "UPDATE demand_orders SET serial_no = ? WHERE id = ?",
            [rows[swapIndex].serial_no, rows[currentIndex].id],
        );
        await pool.query(
            "UPDATE demand_orders SET serial_no = ? WHERE id = ?",
            [rows[currentIndex].serial_no, rows[swapIndex].id],
        );
        res.status(200).send();
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.post("/api/bill-orders/move/:id", async (req, res) => {
    const { id } = req.params;
    const { direction, financial_year } = req.body;
    try {
        const [rows] = await pool.query(
            "SELECT id, serial_no FROM bill_orders WHERE financial_year = ? ORDER BY serial_no",
            [financial_year],
        );
        const currentIndex = rows.findIndex((row) => row.id == id);
        if (
            currentIndex === -1 ||
            (direction === "up" && currentIndex === 0) ||
            (direction === "down" && currentIndex === rows.length - 1)
        ) {
            return res.status(400).send("Cannot move row");
        }
        const swapIndex =
            direction === "up" ? currentIndex - 1 : currentIndex + 1;
        await pool.query("UPDATE bill_orders SET serial_no = ? WHERE id = ?", [
            rows[swapIndex].serial_no,
            rows[currentIndex].id,
        ]);
        await pool.query("UPDATE bill_orders SET serial_no = ? WHERE id = ?", [
            rows[currentIndex].serial_no,
            rows[swapIndex].id,
        ]);
        res.status(200).send();
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.post("/api/supply-orders/import", async (req, res) => {
    const { data, financial_year } = req.body;
    try {
        for (const row of data) {
            await pool.query(
                `INSERT INTO supply_orders (serial_no, supply_order_no_date, firm_name, nomenclature, quantity, 
                    original_date, revised_date1, revised_date2, revised_date3, 
                    build_up, maint, misc, project_no_pdc, p_np, expenditure_head, rev_cap, actual_delivery_date,
                    procurement_mode, delivery_done, remarks, financial_year) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    row.serial_no || null,
                    row.supply_order_no_date || null,
                    row.firm_name || null,
                    row.nomenclature || null,
                    row.quantity || null,
                    row.original_date || null,
                    row.revised_date1 || null,
                    row.revised_date2 || null,
                    row.revised_date3 || null,
                    row.build_up || null,
                    row.maint || null,
                    row.misc || null,
                    row.project_no_pdc || null,
                    row.p_np || null,
                    row.expenditure_head || null,
                    row.rev_cap || null,
                    row.actual_delivery_date || null,
                    row.procurement_mode || null,
                    row.delivery_done || null,
                    row.remarks || null,
                    financial_year || null,
                ],
            );
        }
        res.status(201).send();
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.post("/api/demand-orders/import", async (req, res) => {
    const { data, financial_year } = req.body;
    try {
        for (const row of data) {
            await pool.query(
                `INSERT INTO demand_orders (serial_no, group_demand_no, demand_date, mmg_control_no, control_date, nomenclature, quantity, 
                    expenditure_head, code_head, rev_cap, procurement_mode, est_cost, imms_control_no, remarks, financial_year) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    row.serial_no,
                    row.group_demand_no,
                    row.demand_date || null,
                    row.mmg_control_no,
                    row.control_date || null,
                    row.nomenclature,
                    row.quantity,
                    row.expenditure_head,
                    row.code_head,
                    row.rev_cap,
                    row.procurement_mode,
                    row.est_cost,
                    row.imms_control_no,
                    row.remarks,
                    financial_year,
                ],
            );
        }
        res.status(201).send();
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.post("/api/bill-orders/import", async (req, res) => {
    const { data, financial_year } = req.body;
    try {
        for (const row of data) {
            await pool.query(
                `INSERT INTO bill_orders (serial_no, bill_control_date, firm_name, supply_order_no, so_date, 
                    project_no, build_up, maintenance, project_less_2cr, project_more_2cr, 
                    procurement_mode, rev_cap, date_amount_passed, ld_amount, remarks, financial_year) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    row.serial_no,
                    row.bill_control_date || null,
                    row.firm_name,
                    row.supply_order_no,
                    row.so_date || null,
                    row.project_no,
                    row.build_up,
                    row.maintenance,
                    row.project_less_2cr,
                    row.project_more_2cr,
                    row.procurement_mode,
                    row.rev_cap,
                    row.date_amount_passed,
                    row.ld_amount,
                    row.remarks,
                    financial_year,
                ],
            );
        }
        res.status(201).send();
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.get("/api/supply-backups", async (req, res) => {
    try {
        const files = await fs.readdir(backupDirs.supply);
        res.json(files);
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.get("/api/demand-backups", async (req, res) => {
    try {
        const files = await fs.readdir(backupDirs.demand);
        res.json(files);
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.get("/api/bill-backups", async (req, res) => {
    try {
        const files = await fs.readdir(backupDirs.bill);
        res.json(files);
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.get("/api/sanction-gen-project-backups", async (req, res) => {
    try {
        const files = await fs.readdir(backupDirs["sanction-gen-project"]);
        res.json(files);
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.get("/api/sanction-misc-backups", async (req, res) => {
    try {
        const files = await fs.readdir(backupDirs["sanction-misc"]);
        res.json(files);
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.get("/api/sanction-training-backups", async (req, res) => {
    try {
        const files = await fs.readdir(backupDirs["sanction-training"]);
        res.json(files);
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

// Sanction Code Register API endpoints
app.get("/api/sanction-gen-project", async (req, res) => {
    const { year, sort = "serial_no" } = req.query;
    try {
        const [rows] = await pool.query(
            `SELECT id, serial_no, DATE_FORMAT(date, '%Y-%m-%d') as date, file_no, sanction_code, code, 
                    np_proj, power, code_head, rev_cap, amount, uo_no, 
                    DATE_FORMAT(uo_date, '%Y-%m-%d') as uo_date, amendment, financial_year 
             FROM sanction_gen_project WHERE financial_year = ? ORDER BY ${sort}`,
            [year],
        );
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.get("/api/sanction-misc", async (req, res) => {
    const { year, sort = "serial_no" } = req.query;
    try {
        const [rows] = await pool.query(
            `SELECT id, serial_no, DATE_FORMAT(date, '%Y-%m-%d') as date, file_no, sanction_code, code, 
                    np_proj, power, code_head, rev_cap, amount, uo_no, 
                    DATE_FORMAT(uo_date, '%Y-%m-%d') as uo_date, amendment, financial_year 
             FROM sanction_misc WHERE financial_year = ? ORDER BY ${sort}`,
            [year],
        );
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.get("/api/sanction-training", async (req, res) => {
    const { year, sort = "serial_no" } = req.query;
    try {
        const [rows] = await pool.query(
            `SELECT id, serial_no, DATE_FORMAT(date, '%Y-%m-%d') as date, file_no, sanction_code, code, 
                    np_proj, power, code_head, rev_cap, amount, uo_no, 
                    DATE_FORMAT(uo_date, '%Y-%m-%d') as uo_date, amendment, financial_year 
             FROM sanction_training WHERE financial_year = ? ORDER BY ${sort}`,
            [year],
        );
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.get("/api/sanction-gen-project/max-serial", async (req, res) => {
    const { year } = req.query;
    try {
        const [rows] = await pool.query(
            "SELECT MAX(serial_no) as maxSerialNo FROM sanction_gen_project WHERE financial_year = ?",
            [year],
        );
        res.json({ maxSerialNo: rows[0].maxSerialNo || 0 });
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.get("/api/sanction-misc/max-serial", async (req, res) => {
    const { year } = req.query;
    try {
        const [rows] = await pool.query(
            "SELECT MAX(serial_no) as maxSerialNo FROM sanction_misc WHERE financial_year = ?",
            [year],
        );
        res.json({ maxSerialNo: rows[0].maxSerialNo || 0 });
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.get("/api/sanction-training/max-serial", async (req, res) => {
    const { year } = req.query;
    try {
        const [rows] = await pool.query(
            "SELECT MAX(serial_no) as maxSerialNo FROM sanction_training WHERE financial_year = ?",
            [year],
        );
        res.json({ maxSerialNo: rows[0].maxSerialNo || 0 });
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.get("/api/sanction-gen-project/:id", async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await pool.query(
            "SELECT * FROM sanction_gen_project WHERE id = ?",
            [id],
        );
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.status(404).send("Not found");
        }
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.get("/api/sanction-misc/:id", async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await pool.query(
            "SELECT * FROM sanction_misc WHERE id = ?",
            [id],
        );
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.status(404).send("Not found");
        }
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.get("/api/sanction-training/:id", async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await pool.query(
            "SELECT * FROM sanction_training WHERE id = ?",
            [id],
        );
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.status(404).send("Not found");
        }
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.post("/api/sanction-gen-project", async (req, res) => {
    const data = req.body;
    try {
        await pool.query(
            `INSERT INTO sanction_gen_project (serial_no, date, file_no, sanction_code, code, np_proj, power, 
                code_head, rev_cap, amount, uo_no, uo_date, amendment, financial_year) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                data.serial_no || null,
                data.date || null,
                data.file_no || null,
                data.sanction_code || null,
                data.code || null,
                data.np_proj || null,
                data.power || null,
                data.code_head || null,
                data.rev_cap || null,
                data.amount || null,
                data.uo_no || null,
                data.uo_date || null,
                data.amendment || null,
                data.financial_year || null,
            ],
        );
        res.status(201).send();
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.post("/api/sanction-misc", async (req, res) => {
    const data = req.body;
    try {
        await pool.query(
            `INSERT INTO sanction_misc (serial_no, date, file_no, sanction_code, code, np_proj, power, 
                code_head, rev_cap, amount, uo_no, uo_date, amendment, financial_year) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                data.serial_no || null,
                data.date || null,
                data.file_no || null,
                data.sanction_code || null,
                data.code || null,
                data.np_proj || null,
                data.power || null,
                data.code_head || null,
                data.rev_cap || null,
                data.amount || null,
                data.uo_no || null,
                data.uo_date || null,
                data.amendment || null,
                data.financial_year || null,
            ],
        );
        res.status(201).send();
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.post("/api/sanction-training", async (req, res) => {
    const data = req.body;
    try {
        await pool.query(
            `INSERT INTO sanction_training (serial_no, date, file_no, sanction_code, code, np_proj, power, 
                code_head, rev_cap, amount, uo_no, uo_date, amendment, financial_year) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                data.serial_no || null,
                data.date || null,
                data.file_no || null,
                data.sanction_code || null,
                data.code || null,
                data.np_proj || null,
                data.power || null,
                data.code_head || null,
                data.rev_cap || null,
                data.amount || null,
                data.uo_no || null,
                data.uo_date || null,
                data.amendment || null,
                data.financial_year || null,
            ],
        );
        res.status(201).send();
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.put("/api/sanction-gen-project/:id", async (req, res) => {
    const { id } = req.params;
    const data = req.body;
    try {
        await pool.query(
            `UPDATE sanction_gen_project SET serial_no = ?, date = ?, file_no = ?, sanction_code = ?, 
                code = ?, np_proj = ?, power = ?, code_head = ?, rev_cap = ?, amount = ?, 
                uo_no = ?, uo_date = ?, amendment = ?, financial_year = ? WHERE id = ?`,
            [
                data.serial_no || null,
                data.date || null,
                data.file_no || null,
                data.sanction_code || null,
                data.code || null,
                data.np_proj || null,
                data.power || null,
                data.code_head || null,
                data.rev_cap || null,
                data.amount || null,
                data.uo_no || null,
                data.uo_date || null,
                data.amendment || null,
                data.financial_year || null,
                id,
            ],
        );
        res.status(200).send();
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.put("/api/sanction-misc/:id", async (req, res) => {
    const { id } = req.params;
    const data = req.body;
    try {
        await pool.query(
            `UPDATE sanction_misc SET serial_no = ?, date = ?, file_no = ?, sanction_code = ?, 
                code = ?, np_proj = ?, power = ?, code_head = ?, rev_cap = ?, amount = ?, 
                uo_no = ?, uo_date = ?, amendment = ?, financial_year = ? WHERE id = ?`,
            [
                data.serial_no || null,
                data.date || null,
                data.file_no || null,
                data.sanction_code || null,
                data.code || null,
                data.np_proj || null,
                data.power || null,
                data.code_head || null,
                data.rev_cap || null,
                data.amount || null,
                data.uo_no || null,
                data.uo_date || null,
                data.amendment || null,
                data.financial_year || null,
                id,
            ],
        );
        res.status(200).send();
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.put("/api/sanction-training/:id", async (req, res) => {
    const { id } = req.params;
    const data = req.body;
    try {
        await pool.query(
            `UPDATE sanction_training SET serial_no = ?, date = ?, file_no = ?, sanction_code = ?, 
                code = ?, np_proj = ?, power = ?, code_head = ?, rev_cap = ?, amount = ?, 
                uo_no = ?, uo_date = ?, amendment = ?, financial_year = ? WHERE id = ?`,
            [
                data.serial_no || null,
                data.date || null,
                data.file_no || null,
                data.sanction_code || null,
                data.code || null,
                data.np_proj || null,
                data.power || null,
                data.code_head || null,
                data.rev_cap || null,
                data.amount || null,
                data.uo_no || null,
                data.uo_date || null,
                data.amendment || null,
                data.financial_year || null,
                id,
            ],
        );
        res.status(200).send();
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.delete("/api/sanction-gen-project/:id", async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query("DELETE FROM sanction_gen_project WHERE id = ?", [id]);
        res.status(200).send();
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.delete("/api/sanction-misc/:id", async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query("DELETE FROM sanction_misc WHERE id = ?", [id]);
        res.status(200).send();
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.delete("/api/sanction-training/:id", async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query("DELETE FROM sanction_training WHERE id = ?", [id]);
        res.status(200).send();
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.post("/api/sanction-gen-project/move/:id", async (req, res) => {
    const { id } = req.params;
    const { direction, financial_year } = req.body;
    try {
        const [rows] = await pool.query(
            "SELECT id, serial_no FROM sanction_gen_project WHERE financial_year = ? ORDER BY serial_no",
            [financial_year],
        );
        const currentIndex = rows.findIndex((row) => row.id == id);
        if (
            currentIndex === -1 ||
            (direction === "up" && currentIndex === 0) ||
            (direction === "down" && currentIndex === rows.length - 1)
        ) {
            return res.status(400).send("Cannot move row");
        }
        const swapIndex =
            direction === "up" ? currentIndex - 1 : currentIndex + 1;
        await pool.query(
            "UPDATE sanction_gen_project SET serial_no = ? WHERE id = ?",
            [rows[swapIndex].serial_no, rows[currentIndex].id],
        );
        await pool.query(
            "UPDATE sanction_gen_project SET serial_no = ? WHERE id = ?",
            [rows[currentIndex].serial_no, rows[swapIndex].id],
        );
        res.status(200).send();
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.post("/api/sanction-misc/move/:id", async (req, res) => {
    const { id } = req.params;
    const { direction, financial_year } = req.body;
    try {
        const [rows] = await pool.query(
            "SELECT id, serial_no FROM sanction_misc WHERE financial_year = ? ORDER BY serial_no",
            [financial_year],
        );
        const currentIndex = rows.findIndex((row) => row.id == id);
        if (
            currentIndex === -1 ||
            (direction === "up" && currentIndex === 0) ||
            (direction === "down" && currentIndex === rows.length - 1)
        ) {
            return res.status(400).send("Cannot move row");
        }
        const swapIndex =
            direction === "up" ? currentIndex - 1 : currentIndex + 1;
        await pool.query(
            "UPDATE sanction_misc SET serial_no = ? WHERE id = ?",
            [rows[swapIndex].serial_no, rows[currentIndex].id],
        );
        await pool.query(
            "UPDATE sanction_misc SET serial_no = ? WHERE id = ?",
            [rows[currentIndex].serial_no, rows[swapIndex].id],
        );
        res.status(200).send();
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.post("/api/sanction-training/move/:id", async (req, res) => {
    const { id } = req.params;
    const { direction, financial_year } = req.body;
    try {
        const [rows] = await pool.query(
            "SELECT id, serial_no FROM sanction_training WHERE financial_year = ? ORDER BY serial_no",
            [financial_year],
        );
        const currentIndex = rows.findIndex((row) => row.id == id);
        if (
            currentIndex === -1 ||
            (direction === "up" && currentIndex === 0) ||
            (direction === "down" && currentIndex === rows.length - 1)
        ) {
            return res.status(400).send("Cannot move row");
        }
        const swapIndex =
            direction === "up" ? currentIndex - 1 : currentIndex + 1;
        await pool.query(
            "UPDATE sanction_training SET serial_no = ? WHERE id = ?",
            [rows[swapIndex].serial_no, rows[currentIndex].id],
        );
        await pool.query(
            "UPDATE sanction_training SET serial_no = ? WHERE id = ?",
            [rows[currentIndex].serial_no, rows[swapIndex].id],
        );
        res.status(200).send();
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.post("/api/sanction-gen-project/import", async (req, res) => {
    const { data, financial_year } = req.body;
    try {
        for (const row of data) {
            await pool.query(
                `INSERT INTO sanction_gen_project (serial_no, date, file_no, sanction_code, code, np_proj, power, 
                    code_head, rev_cap, amount, uo_no, uo_date, amendment, financial_year) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    row.serial_no,
                    row.date || null,
                    row.file_no,
                    row.sanction_code,
                    row.code,
                    row.np_proj,
                    row.power,
                    row.code_head,
                    row.rev_cap,
                    row.amount,
                    row.uo_no,
                    row.uo_date || null,
                    row.amendment,
                    financial_year,
                ],
            );
        }
        res.status(201).send();
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.post("/api/sanction-misc/import", async (req, res) => {
    const { data, financial_year } = req.body;
    try {
        for (const row of data) {
            await pool.query(
                `INSERT INTO sanction_misc (serial_no, date, file_no, sanction_code, code, np_proj, power, 
                    code_head, rev_cap, amount, uo_no, uo_date, amendment, financial_year) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    row.serial_no,
                    row.date || null,
                    row.file_no,
                    row.sanction_code,
                    row.code,
                    row.np_proj,
                    row.power,
                    row.code_head,
                    row.rev_cap,
                    row.amount,
                    row.uo_no,
                    row.uo_date || null,
                    row.amendment,
                    financial_year,
                ],
            );
        }
        res.status(201).send();
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.post("/api/sanction-training/import", async (req, res) => {
    const { data, financial_year } = req.body;
    try {
        for (const row of data) {
            await pool.query(
                `INSERT INTO sanction_training (serial_no, date, file_no, sanction_code, code, np_proj, power, 
                    code_head, rev_cap, amount, uo_no, uo_date, amendment, financial_year) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    row.serial_no,
                    row.date || null,
                    row.file_no,
                    row.sanction_code,
                    row.code,
                    row.np_proj,
                    row.power,
                    row.code_head,
                    row.rev_cap,
                    row.amount,
                    row.uo_no,
                    row.uo_date || null,
                    row.amendment,
                    financial_year,
                ],
            );
        }
        res.status(201).send();
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

// Dashboard analytics endpoints
app.get("/api/dashboard/overview", requireAuth, async (req, res) => {
    const { year } = req.query;
    try {
        const [supplyResult, demandResult, billResult] = await Promise.all([
            pool.query("SELECT COUNT(*) as count FROM supply_orders WHERE financial_year = ?", [year]),
            pool.query("SELECT COUNT(*) as count FROM demand_orders WHERE financial_year = ?", [year]),
            pool.query("SELECT COUNT(*) as count FROM bill_orders WHERE financial_year = ?", [year])
        ]);
        
        const [deliveredResult] = await pool.query(
            "SELECT COUNT(*) as count FROM supply_orders WHERE financial_year = ? AND delivery_done = 'Yes'", 
            [year]
        );
        
        const [totalValueResult] = await pool.query(
            "SELECT SUM(build_up + maintenance + project_less_2cr + project_more_2cr) as total FROM bill_orders WHERE financial_year = ?", 
            [year]
        );
        
        res.json({
            totalSupply: supplyResult[0][0].count,
            totalDemand: demandResult[0][0].count,
            totalBill: billResult[0][0].count,
            deliveredOrders: deliveredResult[0][0].count,
            totalValue: totalValueResult[0][0].total || 0
        });
    } catch (error) {
        console.error("Dashboard overview error:", error);
        res.status(500).json({ error: "Failed to fetch dashboard overview" });
    }
});

app.get("/api/dashboard/trends", requireAuth, async (req, res) => {
    const { year } = req.query;
    try {
        const [monthlySupply] = await pool.query(
            `SELECT DATE_FORMAT(original_date, '%Y-%m') as month, COUNT(*) as count 
             FROM supply_orders 
             WHERE financial_year = ? AND original_date IS NOT NULL 
             GROUP BY DATE_FORMAT(original_date, '%Y-%m') 
             ORDER BY month`, 
            [year]
        );
        
        const [monthlyDemand] = await pool.query(
            `SELECT DATE_FORMAT(demand_date, '%Y-%m') as month, COUNT(*) as count 
             FROM demand_orders 
             WHERE financial_year = ? AND demand_date IS NOT NULL 
             GROUP BY DATE_FORMAT(demand_date, '%Y-%m') 
             ORDER BY month`, 
            [year]
        );
        
        const [monthlyBill] = await pool.query(
            `SELECT DATE_FORMAT(bill_control_date, '%Y-%m') as month, COUNT(*) as count 
             FROM bill_orders 
             WHERE financial_year = ? AND bill_control_date IS NOT NULL 
             GROUP BY DATE_FORMAT(bill_control_date, '%Y-%m') 
             ORDER BY month`, 
            [year]
        );
        
        res.json({
            supply: monthlySupply[0],
            demand: monthlyDemand[0],
            bill: monthlyBill[0]
        });
    } catch (error) {
        console.error("Dashboard trends error:", error);
        res.status(500).json({ error: "Failed to fetch dashboard trends" });
    }
});

app.get("/api/dashboard/procurement-analysis", requireAuth, async (req, res) => {
    const { year } = req.query;
    try {
        const [procurementData] = await pool.query(
            `SELECT procurement_mode, COUNT(*) as count 
             FROM supply_orders 
             WHERE financial_year = ? 
             GROUP BY procurement_mode`, 
            [year]
        );
        
        res.json(procurementData[0]);
    } catch (error) {
        console.error("Procurement analysis error:", error);
        res.status(500).json({ error: "Failed to fetch procurement analysis" });
    }
});

app.get("/api/dashboard/firm-analysis", requireAuth, async (req, res) => {
    const { year } = req.query;
    try {
        const [firmData] = await pool.query(
            `SELECT firm_name, COUNT(*) as count 
             FROM supply_orders 
             WHERE financial_year = ? 
             GROUP BY firm_name 
             ORDER BY count DESC 
             LIMIT 10`, 
            [year]
        );
        
        res.json(firmData[0]);
    } catch (error) {
        console.error("Firm analysis error:", error);
        res.status(500).json({ error: "Failed to fetch firm analysis" });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: "Something went wrong!" });
});

// Graceful shutdown
process.on("SIGINT", async () => {
    console.log("Shutting down gracefully...");
    await pool.end();
    process.exit(0);
});

process.on("SIGTERM", async () => {
    console.log("Shutting down gracefully...");
    await pool.end();
    process.exit(0);
});

// Enhanced server startup with port conflict handling
const startServer = () => {
    server.listen(port, "0.0.0.0", () => {
        console.log(`Server running on http://0.0.0.0:${port}`);
    });

    server.on("error", (err) => {
        if (err.code === "EADDRINUSE") {
            console.log(
                `Port ${port} is already in use. Trying to kill existing process...`,
            );

            // For Replit environment, try a different port
            const newPort = port + 1;
            console.log(`Attempting to start server on port ${newPort}...`);

            server.listen(newPort, "0.0.0.0", () => {
                console.log(`Server running on http://0.0.0.0:${newPort}`);
            });

            server.on("error", (newErr) => {
                console.error(
                    "Failed to start server on alternative port:",
                    newErr,
                );
                process.exit(1);
            });
        } else {
            console.error("Server error:", err);
            process.exit(1);
        }
    });
};

startServer();