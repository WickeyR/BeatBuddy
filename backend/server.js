// server.js
const express = require('express');
const OpenAI = require('openai'); // Your OpenAI integration
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const app = express();
const mysql = require('mysql2');
const saltRounds = 10;
const session = require('express-session');


app.use(session({
  secret:'temp', // Secret for signing the session ID cookie
  resave: false, // Avoid resaving session if it hasn't changed
  saveUninitialized: false, // Don't save uninitialized sessions
}));


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

//-------------------------- OpenAI API calls -----------------//

const openai = new OpenAI(process.env.OPENAI_API_KEY);


app.post('/api/messageGPT', async (req, res) => {
  try {
    const { userInput, conversationId } = req.body;

    if (!conversationId) {
      return res.status(400).json({ success: false, error: 'Missing conversationId.' });
    }

    // Retrieve conversation history from the database
    const selectMessagesQuery = `
      SELECT sender, message_content 
      FROM messages 
      WHERE conversation_id = ? 
      ORDER BY timestamp ASC
    `;
    db.query(selectMessagesQuery, [conversationId], async (err, messages) => {
      if (err) {
        console.error('Error fetching conversation history:', err);
        return res.status(500).json({ success: false, error: 'Error fetching conversation history.' });
      }

      // Format conversation history for OpenAI
      const conversationHistory = messages.map((msg) => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.message_content,
      }));

      // Add the user's input to the conversation history
      conversationHistory.push({ role: 'user', content: userInput });

      try {
        // Call OpenAI API
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini', // Use the appropriate model
          messages: [
            { role: 'system', content: 'You are Beat Buddy, a music buddy that helps users discover music and build playlists.' },
            ...conversationHistory,
          ],
          max_tokens: 175,
          temperature: 0.7,
        });

        const aiResponse = completion.choices[0].message.content;

        // Save user's message and AI's response in the database
        const insertMessagesQuery = `
          INSERT INTO messages (conversation_id, sender, message_content) 
          VALUES (?, ?, ?), (?, ?, ?)
        `;
        db.query(
          insertMessagesQuery,
          [conversationId, 'user', userInput, conversationId, 'bot', aiResponse],
          (err) => {
            if (err) {
              console.error('Error saving messages:', err);
              return res.status(500).json({ success: false, error: 'Error saving messages.' });
            }

            // Return AI's response to the client
            res.json({ success: true, response: aiResponse });
          }
        );
      } catch (error) {
        console.error('Error with OpenAI API:', error);
        res.status(500).json({ success: false, error: 'Failed to generate response from OpenAI.' });
      }
    });
  } catch (error) {
    console.error('Unexpected server error:', error);
    res.status(500).json({ success: false, error: 'Unexpected server error.' });
  }
});
// Get the playlist for a conversation
app.get('/conversations/:conversationId/playlist', isAuthenticated, (req, res) => {
  const conversationId = req.params.conversationId;
  const userId = req.session.userId;

  // Verify that the conversation belongs to the user
  const verifyQuery = 'SELECT * FROM conversations WHERE conversation_id = ? AND user_id = ?';
  db.query(verifyQuery, [conversationId, userId], (err, results) => {
    if (err) {
      console.error('Error verifying conversation:', err);
      return res.status(500).json({ error: 'Server error' });
    }

    if (results.length === 0) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Fetch the playlist for the conversation
    const selectPlaylistQuery = 'SELECT * FROM conversation_songs WHERE conversation_id = ?';
    db.query(selectPlaylistQuery, [conversationId], (err, playlistResults) => {
      if (err) {
        console.error('Error fetching playlist:', err);
        return res.status(500).json({ error: 'Server error' });
      }

      res.json(playlistResults);
    });
  });
});

//--------------------------User Login Functions -----------------//

// API endpoint to get user information
app.get('/user', (req, res) => {
  const userId = req.session.userId; // Retrieve the logged-in user's ID from the session

  const query = 'SELECT username FROM users WHERE id = ?'; // Query to fetch the username using the user's ID
  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Server error' }); // Handle any server/database errors
    }

    if (results.length > 0) {
      const user = results[0];
      res.json({ username: user.username }); // Return the username as a JSON response
    } else {
      res.status(404).json({ error: 'User not found' }); // Handle the case where the user is not found
    }
  });
});

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
          req.session.userId = user.id;
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


// Create a new conversation
app.post('/conversations', isAuthenticated, (req, res) => {
  const userId = req.session.userId;
  const title = req.body.title || null;

  const insertQuery = 'INSERT INTO conversations (user_id, title) VALUES (?, ?)';
  db.query(insertQuery, [userId, title], (err, result) => {
    if (err) {
      console.error('Error creating conversation:', err);
      return res.status(500).json({ error: 'Server error' });
    }
    res.json({ conversation_id: result.insertId });
  });
});

// Get all conversations for the user
app.get('/conversations', isAuthenticated, (req, res) => {
  const userId = req.session.userId;

  const selectQuery = 'SELECT * FROM conversations WHERE user_id = ? ORDER BY start_time DESC';
  db.query(selectQuery, [userId], (err, results) => {
    if (err) {
      console.error('Error fetching conversations:', err);
      return res.status(500).json({ error: 'Server error' });
    }
    res.json(results);
  });
});

// Get messages for a conversation
app.get('/conversations/:conversationId/messages', isAuthenticated, (req, res) => {
  const conversationId = req.params.conversationId;

  const selectQuery = 'SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC';
  db.query(selectQuery, [conversationId], (err, results) => {
    if (err) {
      console.error('Error fetching messages:', err);
      return res.status(500).json({ error: 'Server error' });
    }
    res.json(results);
  });
});

// Send a message in a conversation
app.post('/conversations/:conversationId/messages', isAuthenticated, async (req, res) => {
  const conversationId = req.params.conversationId;
  const { message_content } = req.body;
  const userId = req.session.userId;

  // Verify that the conversation belongs to the user
  const verifyQuery = 'SELECT * FROM conversations WHERE conversation_id = ? AND user_id = ?';
  db.query(verifyQuery, [conversationId, userId], async (err, results) => {
    if (err) {
      console.error('Error verifying conversation:', err);
      return res.status(500).json({ error: 'Server error' });
    }

    if (results.length === 0) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Insert user's message
    const insertUserMessageQuery = 'INSERT INTO messages (conversation_id, sender, message_content) VALUES (?, ?, ?)';
    db.query(insertUserMessageQuery, [conversationId, 'user', message_content], async (err, result) => {
      if (err) {
        console.error('Error inserting user message:', err);
        return res.status(500).json({ error: 'Server error' });
      }

      // Retrieve conversation history for AI context
      const selectMessagesQuery = 'SELECT sender, message_content FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC';
      db.query(selectMessagesQuery, [conversationId], async (err, messages) => {
        if (err) {
          console.error('Error fetching conversation history:', err);
          return res.status(500).json({ error: 'Server error' });
        }

        // Format conversation history for AI
        const conversationHistory = messages.map((msg) => ({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.message_content,
        }));

        try {
          // Get AI response
          const { response: aiResponse } = await messageGPT(message_content, conversationHistory, userId);

          // Insert AI's message
          const insertAIMessageQuery = 'INSERT INTO messages (conversation_id, sender, message_content) VALUES (?, ?, ?)';
          db.query(insertAIMessageQuery, [conversationId, 'bot', aiResponse], (err, result) => {
            if (err) {
              console.error('Error inserting AI message:', err);
              return res.status(500).json({ error: 'Server error' });
            }

            res.json({ output: aiResponse });
          });
        } catch (error) {
          console.error('Error in OpenAI API:', error);
          res.status(500).json({ error: 'Failed to generate response from OpenAI.' });
        }
      });
    });
  });
});








// Logout route
app.post('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});
  
  
// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
  if (req.session.userId) {
    next();
  } else {
    res.redirect('/');
  }
}
  
  
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