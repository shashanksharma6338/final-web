
const bcrypt = require("bcryptjs");
const pool = require("./db");

// Initialize users table if it doesn't exist
async function initializeAuth() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                security_answer_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // Add role column if it doesn't exist
        try {
            await pool.query("ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'viewer'");
        } catch (error) {
            // Column already exists, ignore error
        }

        // Check if admin user exists, if not create it
        const adminUsername = process.env.ADMIN_USERNAME || "admin";
        const [existingAdminUser] = await pool.query("SELECT id FROM users WHERE username = ?", [adminUsername]);
        
        if (existingAdminUser.length === 0) {
            const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
            const securityAnswer = process.env.SECURITY_ANSWER || "krishna";
            const hashedPassword = await bcrypt.hash(adminPassword, 12);
            const hashedSecurityAnswer = await bcrypt.hash(securityAnswer, 12);
            
            await pool.query(
                "INSERT INTO users (username, password_hash, security_answer_hash, role) VALUES (?, ?, ?, ?)",
                [adminUsername, hashedPassword, hashedSecurityAnswer, "admin"]
            );
        } else {
            // Update existing admin user to have admin role
            await pool.query("UPDATE users SET role = 'admin' WHERE username = ?", [adminUsername]);
        }

        // Check if viewer user exists, if not create it
        const [existingViewerUser] = await pool.query("SELECT id FROM users WHERE username = ?", ["viewer"]);
        
        if (existingViewerUser.length === 0) {
            const viewerPassword = process.env.VIEWER_PASSWORD || "viewer123";
            const securityAnswer = process.env.SECURITY_ANSWER || "krishna";
            const hashedPassword = await bcrypt.hash(viewerPassword, 12);
            const hashedSecurityAnswer = await bcrypt.hash(securityAnswer, 12);
            
            await pool.query(
                "INSERT INTO users (username, password_hash, security_answer_hash, role) VALUES (?, ?, ?, ?)",
                ["viewer", hashedPassword, hashedSecurityAnswer, "viewer"]
            );
        }

        // Check if gaming user exists, if not create it
        const [existingGamingUser] = await pool.query("SELECT id FROM users WHERE username = ?", ["king"]);
        
        if (existingGamingUser.length === 0) {
            const gamingPassword = "queen";
            const securityAnswer = process.env.SECURITY_ANSWER || "krishna";
            const hashedPassword = await bcrypt.hash(gamingPassword, 12);
            const hashedSecurityAnswer = await bcrypt.hash(securityAnswer, 12);
            
            await pool.query(
                "INSERT INTO users (username, password_hash, security_answer_hash, role) VALUES (?, ?, ?, ?)",
                ["king", hashedPassword, hashedSecurityAnswer, "gamer"]
            );
        }
    } catch (error) {
        console.error("Error initializing auth:", error);
    }
}

async function authenticateUser(username, password) {
    try {
        const [users] = await pool.query("SELECT * FROM users WHERE username = ?", [username]);
        
        if (users.length === 0) {
            return false;
        }

        const user = users[0];
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        
        return isValidPassword ? user : false;
    } catch (error) {
        console.error("Authentication error:", error);
        return false;
    }
}

async function verifySecurityAnswer(username, answer) {
    try {
        const [users] = await pool.query("SELECT security_answer_hash FROM users WHERE username = ?", [username]);
        
        if (users.length === 0) {
            return false;
        }

        const isValidAnswer = await bcrypt.compare(answer.toLowerCase().trim(), users[0].security_answer_hash);
        return isValidAnswer;
    } catch (error) {
        console.error("Security verification error:", error);
        return false;
    }
}

async function changePassword(username, newPassword) {
    try {
        if (!newPassword || newPassword.length < 6) {
            throw new Error("Password must be at least 6 characters long");
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);
        
        await pool.query(
            "UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ?",
            [hashedPassword, username]
        );
        
        return true;
    } catch (error) {
        console.error("Password change error:", error);
        throw error;
    }
}

module.exports = {
    initializeAuth,
    authenticateUser,
    verifySecurityAnswer,
    changePassword
};
