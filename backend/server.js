//server.js: The central backend server for BeatBuddy


//Import libraries 
require('dotenv').config(); // Load environment variables
const express = require('express'); // Express for routing
const path = require('path'); // For working with file paths
const app = express(); // Initialize the Express application


// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, '..', 'public')));


app.get('/api/env', (req, res) => {
    res.json({ LAST_FM_API_KEY: process.env.LAST_FM_API_KEY });
  });
  
// Default route to serve the login page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/login.html'));
  });

  // Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});