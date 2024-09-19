import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import connection from './db.js'; // Promise-based connection
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const app = express();

const corsOptions = {
  origin: (process.env.NODE_ENV === 'production')
    ? '*'  // Allow all origins in production (you can limit this by specifying domains)
    : 'http://localhost:5173',  // Allow only localhost in development
  credentials: true,  // Allow credentials like cookies, authorization headers, etc.
};

app.use(cors(corsOptions));
app.options('*', cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json()); 

// Simple logging middleware for requests
app.use((req, res, next) => {
    console.log(`${req.method} request to ${req.path}`);
    next();
});

// POST /api/users to store a new user in the database
app.post('/api/users', async (req, res) => {
  const { uid, email } = req.body;

  if (!uid || !email) {
    return res.status(400).json({ message: 'Missing required user information' });
  }

  try {
    // Check if the user already exists in the database
    const [existingUser] = await connection.query('SELECT * FROM users WHERE firebase_user_id = ?', [uid]);

    if (existingUser.length > 0) {
      return res.status(200).json({ message: 'User already exists' });
    }

    // Insert a new user into the database
    const [result] = await connection.query(
      'INSERT INTO users (firebase_user_id, email, created_at) VALUES (?, ?, NOW())',
      [uid, email]
    );

    res.status(201).json({ message: 'User stored in database successfully', userId: result.insertId });
  } catch (error) {
    console.error('Error storing user in database:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Example API routes
app.post('/api/save-collection', async (req, res) => {
  const { uid, name, url, method, params, headers, body } = req.body;

  if (!uid || !name || !url || !method) {
    return res.status(400).json({ message: 'Missing required collection information or user authentication' });
  }

  try {
    // Insert the collection into the database
    const [result] = await connection.query(
      'INSERT INTO collections (uid, name, url, method, headers, params, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
      [uid, name, url, method, JSON.stringify(headers), JSON.stringify(params), JSON.stringify(body)]
    );

    res.status(201).json({ message: 'Collection saved successfully', collectionId: result.insertId });
  } catch (error) {
    console.error('Error saving collection:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


app.get('/api/collections', async (req, res) => {
  const uid = req.query.uid;  // Get the user's UID from the query parameters

  if (!uid) {
    return res.status(400).json({ message: 'Missing user authentication' });
  }

  try {
    // Retrieve collections only for the logged-in user
    const [collections] = await connection.query(
      'SELECT * FROM collections WHERE uid = ?',
      [uid]
    );
    res.status(200).json(collections);
  } catch (error) {
    console.error('Error retrieving collections:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.put('/api/collections/:id', async (req, res) => {
  const { uid, name, url, method, params, headers, body } = req.body;
  const { id } = req.params;  // Get the collection id from the URL params

  try {
    // Construct the SQL query dynamically to only update non-null values
    const updates = [];
    const values = [];

    if (uid !== null) {
      updates.push('uid = ?');
      values.push(uid);
    }
    if (name !== null) {
      updates.push('name = ?');
      values.push(name);
    }
    if (url !== null) {
      updates.push('url = ?');
      values.push(url);
    }
    if (method !== null) {
      updates.push('method = ?');
      values.push(method);
    }
    if (params !== null) {
      updates.push('params = ?');
      values.push(JSON.stringify(params));  // Store as a JSON string if needed
    }
    if (headers !== null) {
      updates.push('headers = ?');
      values.push(JSON.stringify(headers));  // Store as a JSON string if needed
    }
    if (body !== null) {
      updates.push('body = ?');
      values.push(JSON.stringify(body));  // Store as a JSON string if needed
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    // Add the collection id to the values array for the WHERE clause
    values.push(id);

    // Construct the final SQL query
    const query = `UPDATE collections SET ${updates.join(', ')} WHERE id = ?`;

    // Execute the query
    await connection.query(query, values);

    res.status(200).json({ message: 'Collection updated successfully' });
  } catch (error) {
    console.error('Error updating collection:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});



// Start the server after connection is established
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Ping the database to ensure connection is valid before starting the server
    await connection.query('SELECT 1');
    console.log("Connected to MySQL database");

    const server = app.listen(PORT,'0.0.0.0', () => {
      console.log(`Server is running on port ${PORT}`);
    });

    // Handle unhandled rejections
    process.on("unhandledRejection", (err) => {
      console.error("Unhandled Rejection:", err);
      server.close(() => {
        process.exit(1);
      });
    });

    // Handle uncaught exceptions
    process.on("uncaughtException", (err) => {
      console.error("Uncaught Exception:", err);
      server.close(() => {
        process.exit(1);
      });
    });

    // Ping the database every 10 minutes to keep the connection alive
    setInterval(async () => {
      try {
        await connection.query('SELECT 1');
        console.log("Database connection is alive");
      } catch (err) {
        console.error("Error keeping the database connection alive:", err);
      }
    }, 600000); // Ping every 10 minutes
  } catch (err) {
    console.error("Error connecting to MySQL database:", err);
    process.exit(1); 
  }
};

startServer();
