//server.js: The central backend server for BeatBuddy


//Import libraries 
const express = require ('express'); // Handles routing 
const path = require('path'); // Used to tell program where to find files 
const app = express();


// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, '..', 'public')));

// Default route to serve the login page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/login.html'));
  });

  // Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});