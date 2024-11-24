// server.js
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const bcrypt = require('bcrypt');
const app = express();
const mysql = require('mysql2');


// Load environment variables
require('dotenv').config();

// Middleware setup
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));



// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, '..', 'public')));


// Redirect to login page on root access
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

// -------------------- Last.fm API Proxy -------------------- //
// Add to server.js

// Endpoint to fetch detailed track info with images
app.get('/api/lastfm/tracks', async (req, res) => {
    const { limit = 10 } = req.query;
    const uniqueArtists = new Set();
    const chartingTracks = [];
    let page = 1;
  
    try {
      while (chartingTracks.length < limit) {
        // Fetch the top tracks from Last.fm
        const response = await axios.get('http://ws.audioscrobbler.com/2.0/', {
          params: {
            method: 'chart.getTopTracks',
            api_key: process.env.LAST_FM_API_KEY,
            limit: 50,
            page,
            format: 'json',
          },
        });
  
        const tracks = response.data.tracks?.track || [];
        if (tracks.length === 0) break; // Stop if no tracks are returned
  
        for (const track of tracks) {
          if (!uniqueArtists.has(track.artist.name)) {
            uniqueArtists.add(track.artist.name);
  
            // Fetch detailed track info to get the album image
            const trackDetailResponse = await axios.get('http://ws.audioscrobbler.com/2.0/', {
              params: {
                method: 'track.getInfo',
                api_key: process.env.LAST_FM_API_KEY,
                artist: track.artist.name,
                track: track.name,
                autocorrect: 1,
                format: 'json',
              },
            });
  
            const trackInfo = trackDetailResponse.data.track;
            const extraLargeImage = trackInfo.album?.image.find((img) => img.size === 'extralarge')?.['#text'];
  
            chartingTracks.push({
              trackName: track.name,
              artistName: track.artist.name,
              imageURL: extraLargeImage || 'No image available',
            });
  
            if (chartingTracks.length === limit) break; // Stop once we reach the limit
          }
        }
  
        page++; // Move to the next page
      }
  
      // Return the charting tracks with images
      res.json(chartingTracks);
    } catch (error) {
      console.error('Error fetching data from Last.fm:', error.message);
      res.status(500).json({ error: 'Failed to fetch data from Last.fm' });
    }
  });

//--------------------------Connect to mysql database-----------------//

//Database information and password 
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

//Attempt connection to database 
db.connect((err) => {
  if (err) throw err;
  console.log('Connected to MySQL database.');
});

//--------------------------User Login Functions -----------------//

app.post('/login', (req, res) => {

  //the form information
  const {username, password} = req.body; 
  
  //Grab information from mysql database
  const selectQuery  = 'SELECT * FROM users WHERE username = ?';

  db.query(selectQuery, [username], (err,results) =>{
    
    //Handle potential error
    if (err){
      console.error("Error with database: ", err);
      return res.status(500).send('Server error');
    }
    //Proceed with user authentication
    if (results.length > 0){
      const user = results[0];

      //Compare the passwords
      bcrypt.compare(password, user.password, (err, match) =>{
        if(err){
          console.error("Error with Bcrypt: ", err);
          return res.status(500).send("Server error");
        }
        
        //Passwords match
        if(match){
          // res.session.userId = user.id;
          res.redirect('/dashboard');
        }
        //Passwords do not match
        else{
          res.status(401).send("Invalid username or pasword");
        }
      });
    } else {
      // User does not exist, create a new user
      bcrypt.hash(password, saltRounds, (err, hash) => {
        if (err) {
          console.error('Bcrypt error:', err);
          return res.status(500).send('Server error');
        }

        //Create a query to insert user information into the database 
        const insertQuery = 'INSERT INTO users (username, password) VALUES (?, ?)';
        db.query(insertQuery, [username, hash], (err, result) => {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).send('Server error');
          }

          // User created successfully, log them in
          req.session.userId = result.insertId;
          res.redirect('/dashboard');
        });
      });
    }
  });
});

  
  
  
  
  
  
  // Dashboard route (protected)
app.get('/dashboard', (req, res) => {
    // Resets playlist data when the user logs in
    // initializeDataFiles();
    res.sendFile(path.join(__dirname, '..', 'public', 'chatApplication.html'));
  });




const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});