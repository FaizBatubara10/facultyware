const db = require('../lib/db');
const bcrypt = require('bcryptjs');

async function init() {
  try {
    // Create users table
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) NOT NULL UNIQUE,
        email VARCHAR(255) DEFAULT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Users table created or already exists.');

    const ensureUserColumn = async (columnName, columnDefinition) => {
      const [columns] = await db.query(
        'SHOW COLUMNS FROM users LIKE ?',
        [columnName]
      );
      if (columns.length === 0) {
        await db.query(`ALTER TABLE users ADD COLUMN ${columnDefinition}`);
      }
    };

    await ensureUserColumn('email', 'email VARCHAR(255) DEFAULT NULL');
    await ensureUserColumn('username', 'username VARCHAR(255) NOT NULL UNIQUE');

    await db.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id INT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        employee_number VARCHAR(255) DEFAULT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_employees_user FOREIGN KEY (id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('Employees table created or already exists.');

    await db.query(`
      CREATE TABLE IF NOT EXISTS meetings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        organizer_id INT NOT NULL,
        leader_id INT NOT NULL,
        meeting_type VARCHAR(100) NOT NULL,
        meeting_date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        online_link VARCHAR(255) DEFAULT NULL,
        is_confidential TINYINT(1) NOT NULL DEFAULT 0,
        status VARCHAR(50) NOT NULL DEFAULT 'draft',
        organizer_id_id INT DEFAULT NULL,
        leader_id_id INT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_meetings_organizer FOREIGN KEY (organizer_id) REFERENCES employees(id) ON DELETE CASCADE,
        CONSTRAINT fk_meetings_leader FOREIGN KEY (leader_id) REFERENCES employees(id) ON DELETE CASCADE
      )
    `);
    console.log('Meetings table created or already exists.');

    await db.query(`
      CREATE TABLE IF NOT EXISTS meeting_participants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        meeting_id INT NOT NULL,
        employee_id INT NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'invited',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_meeting_participants_meeting FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
        CONSTRAINT fk_meeting_participants_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
        UNIQUE KEY uq_meeting_employee (meeting_id, employee_id)
      )
    `);
    console.log('Meeting participants table created or already exists.');


    await db.query(`
      CREATE TABLE IF NOT EXISTS meeting_external_participants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        meeting_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        institution VARCHAR(255) DEFAULT NULL,
        email VARCHAR(255) DEFAULT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'invited',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_meeting_external_participants_meeting FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
      )
    `);
    console.log('Meeting external participants table created or already exists.');

    await db.query(`
      CREATE TABLE IF NOT EXISTS meeting_minutes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        meeting_id INT NOT NULL,
        file VARCHAR(255) NOT NULL,
        summary TEXT,
        created_by INT NOT NULL,
        employee_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_meeting_minutes_meeting FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
        CONSTRAINT fk_meeting_minutes_created_by FOREIGN KEY (created_by) REFERENCES employees(id),
        CONSTRAINT fk_meeting_minutes_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
      )
    `);
    console.log('Meeting minutes table created or already exists.');

    await db.query(`
      CREATE TABLE IF NOT EXISTS meeting_documents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        meeting_id INT NOT NULL,
        title VARCHAR(255) DEFAULT NULL,
        file_path VARCHAR(255) NOT NULL,
        file_type VARCHAR(100) DEFAULT NULL,
        uploaded_by INT NOT NULL,
        employee_id INT NOT NULL,
        uploaded_at DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_meeting_documents_meeting FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
        CONSTRAINT fk_meeting_documents_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES employees(id),
        CONSTRAINT fk_meeting_documents_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
      )
    `);
    console.log('Meeting documents table created or already exists.');

    const [users] = await db.query('SELECT * FROM users WHERE username = ? LIMIT 1', ['admin']);
    let adminId;

    if (users.length === 0) {
      const hashedPassword = await bcrypt.hash('password', 10);
      const [result] = await db.query(
        'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
        ['admin', 'admin', hashedPassword]
      );
      adminId = result.insertId;
      console.log('Test user "admin" created with password "password".');
    } else {
      adminId = users[0].id;
      if (!users[0].email) {
        await db.query('UPDATE users SET email = ? WHERE id = ?', ['admin', adminId]);
      }
      console.log('Test user "admin" already exists.');
    }

    const [employeeRows] = await db.query('SELECT * FROM employees WHERE id = ? LIMIT 1', [adminId]);
    if (employeeRows.length === 0) {
      await db.query(
        'INSERT INTO employees (id, name, employee_number, status) VALUES (?, ?, ?, ?)',
        [adminId, 'Admin', 'ADMIN-001', 'active']
      );
      console.log('Admin employee record created.');
    } else {
      console.log('Admin employee record already exists.');
    }

    process.exit(0);
  } catch (err) {
    console.error('Error initializing database:', err);
    process.exit(1);
  }
}

init();
