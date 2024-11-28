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
const passport = require('passport');
const SpotifyStrategy = require('passport-spotify').Strategy;
const saltRounds = 10;
const session = require('express-session');
const {functionDefinitions, sanitizeMessages } = require('./openAIFunctions.js');

const SpotifyWebApi = require('spotify-web-api-node');


const {
  getTrackInfo,
  getRelatedTracks,
  searchTrack,
  getAlbumInfo,
  searchAlbum,
  getTagsTopTracks,
  getTagsTopArtists,
  deleteFromPlaylist,
  getChartTopArtists,
  getChartTopTags,
  getChartTopTracks,
} = require('./MusicFunctions');

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

app.use(passport.initialize());
app.use(passport.session());

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
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  port: process.env.MYSQL_PORT,
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

      // Define the system prompt and add it to the message chain
      const systemPrompt = `
  You are Beat Buddy, a music recommender. Guide the user and make playlists based on their inputs and suggestions.`;

      const aiMessages = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory,
      ];

      // Sanitize messages before sending to OpenAI
      const sanitizedMessages = sanitizeMessages(aiMessages);

      try {
        // Call OpenAI API
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: sanitizedMessages,
          functions: functionDefinitions,
          function_call: 'auto',
          max_tokens: 250,
          temperature: 0.7,
        });

        const responseMessage = completion.choices[0].message;

        // Check if the assistant wants to call a function
        if (responseMessage.function_call) {
          const functionName = responseMessage.function_call.name;
          const functionArgs = JSON.parse(responseMessage.function_call.arguments);

          // Execute the corresponding function
          let functionResult;
          switch (functionName) {
            case 'searchTrack':
              functionResult = await searchTrack(
                functionArgs.songTitle,
                functionArgs.limit || 5,
                process.env.LAST_FM_API_KEY
              );
              break;
            case 'getTrackInfo':
              functionResult = await getTrackInfo(
                functionArgs.artist,
                functionArgs.songTitle,
                process.env.LAST_FM_API_KEY
              );
              break;
            case 'getAlbumInfo':
              functionResult = await getAlbumInfo(
                functionArgs.artist,
                functionArgs.albumTitle,
                process.env.LAST_FM_API_KEY
              );
              break;
            case 'getRelatedTracks':
              functionResult = await getRelatedTracks(
                functionArgs.artist,
                functionArgs.songTitle,
                functionArgs.limit || 5,
                process.env.LAST_FM_API_KEY
              );
              break;
            case 'searchAlbum':
              functionResult = await searchAlbum(
                functionArgs.albumTitle,
                functionArgs.limit || 5,
                process.env.LAST_FM_API_KEY
              );
              break;
            case 'getTagsTopTracks':
              functionResult = await getTagsTopTracks(
                functionArgs.tag,
                functionArgs.limit || 5,
                process.env.LAST_FM_API_KEY
              );
              break;
            case 'getTagsTopArtists':
              functionResult = await getTagsTopArtists(
                functionArgs.tag,
                functionArgs.limit || 5,
                process.env.LAST_FM_API_KEY
              );
              break;
            case 'getChartTopArtists':
              functionResult = await getChartTopArtists(
                functionArgs.limit || 5,
                process.env.LAST_FM_API_KEY
              );
              break;
            case 'getChartTopTags':
              functionResult = await getChartTopTags(
                functionArgs.limit || 5,
                process.env.LAST_FM_API_KEY
              );
              break;
            case 'getChartTopTracks':
              functionResult = await getChartTopTracks(
                functionArgs.limit || 5,
                process.env.LAST_FM_API_KEY
              );
              break;
          
            case 'deleteFromPlaylist':
              functionResult = await deleteFromPlaylist(
                functionArgs.songTitle,
                functionArgs.artist
              );
              break;
            case 'printPlaylist':
              functionResult = await printPlaylist();
              break;
            case 'createPlaylist':
              functionResult = await createPlaylist(
                functionArgs.playlistTitle,
                conversationId
              );
              break;
            case 'buildSuggestedGenrePlaylist':
              functionResult = await buildSuggestedGenrePlaylist(
                functionArgs.genre || null,
                functionArgs.limit || 10
              );
              break;
            case 'buildDatabasePlaylist':
              functionResult = await buildDatabasePlaylist(
                functionArgs.limit || 10,
                conversationId
              );
              break;
            case 'buildOnCurrentPlaylist':
              functionResult = await buildOnCurrentPlaylist(
                functionArgs.limit || 10
              );
              break;
              case 'addToPlaylist':
                  functionResult = await addToPlaylist(
                    conversationId, // Pass the conversation ID here
                    functionArgs.songTitle,
                    functionArgs.artist
                    );
                    break;
            default:
              throw new Error(`Function ${functionName} is not implemented.`);
          }

          // Add the function's result to the conversation history
          conversationHistory.push({
            role: 'function',
            name: functionName,
            content: JSON.stringify(functionResult),
          });

          // Call the OpenAI API again with updated conversation history
          const completion2 = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: sanitizeMessages(conversationHistory),
            max_tokens: 250,
            temperature: 0.7,
          });

          const finalResponseMessage = completion2.choices[0].message.content;

          // Save AI's response and function results in the database
          const insertMessagesQuery = `
            INSERT INTO messages (conversation_id, sender, message_content) 
            VALUES (?, ?, ?), (?, ?, ?)
          `;
          db.query(
            insertMessagesQuery,
            [conversationId, 'user', userInput, conversationId, 'bot', finalResponseMessage],
            (err) => {
              if (err) {
                console.error('Error saving messages:', err);
                return res.status(500).json({ success: false, error: 'Error saving messages.' });
              }

              // Send the final response to the client
              res.json({ success: true, response: finalResponseMessage });
            }
          );
        } else {
          // If no function call, handle as usual
          const aiResponse = responseMessage.content;

          // Save the user's and AI's messages in the database
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

              // Send AI's response to the client
              res.json({ success: true, response: aiResponse });
            }
          );
        }
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
    const selectPlaylistQuery = 'SELECT * FROM playlist WHERE conversation_id = ?';
    db.query(selectPlaylistQuery, [conversationId], (err, playlistResults) => {
      if (err) {
        console.error('Error fetching playlist:', err);
        return res.status(500).json({ error: 'Server error' });
      }

      res.json(playlistResults);
    });
  });
});

//----------------- Playlist functions ---------------------------//
// Delete a song from the playlist
app.delete('/conversations/:conversationId/playlist/:songId', isAuthenticated, (req, res) => {
  const conversationId = req.params.conversationId;
  const songId = req.params.songId;
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

    // Delete the song from the playlist
    const deleteQuery = 'DELETE FROM playlist WHERE id = ? AND conversation_id = ?';
    db.query(deleteQuery, [songId, conversationId], (err, result) => {
      if (err) {
        console.error('Error deleting song from playlist:', err);
        return res.status(500).json({ error: 'Server error' });
      }

      res.json({ success: true, message: 'Song deleted from playlist.' });
    });
  });
});


async function addToPlaylist(conversation_id, songTitle, artist) {
  try {
    // Fetch track information from Last.fm API
    const response = await axios.get('http://ws.audioscrobbler.com/2.0/', {
      params: {
        method: 'track.getInfo',
        api_key: process.env.LAST_FM_API_KEY,
        artist: artist,
        track: songTitle,
        autocorrect: 1,
        format: 'json',
      },
    });

    // Access the track information
    const trackInfo = response.data.track;

    // Extract the 'extralarge' image URL
    const imageURL = trackInfo.album?.image.find(
      (img) => img.size === 'extralarge'
    )?.['#text'] || '';

    // Prepare values for insertion
    const values = [
      conversation_id,
      trackInfo.name || '',
      trackInfo.artist?.name || '',
      trackInfo.album?.title || '',
      imageURL,
    ];

    // Insert song into the playlist table
    const insertQuery = `
      INSERT INTO playlist (conversation_id, song_title, song_artist, song_album, song_large_image_url)
      VALUES (?, ?, ?, ?, ?)
    `;

    await db.promise().query(insertQuery, values);
    console.log('Song added to playlist:', trackInfo.name);

    return { message: 'Song added to playlist successfully.' };
  } catch (error) {
    console.error('Error adding song to playlist:', error);
    throw error;
  }
}



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
  //-----------------spotify connection ------------------------
  

// Configure Spotify Strategy
passport.use(
  new SpotifyStrategy(
    {
      clientID: process.env.SPOTIFY_CLIENT_ID,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
      callbackURL: process.env.SPOTIFY_CALLBACK_URL,
      passReqToCallback: true,
    },
    function (req, accessToken, refreshToken, expires_in, profile, done) {
      const userId = req.session.userId;
      const expiresAt = new Date(Date.now() + expires_in * 1000);

      const updateQuery = `
        UPDATE users
        SET spotify_access_token = ?, spotify_refresh_token = ?, spotify_token_expires = ?
        WHERE id = ?
      `;
      db.query(updateQuery, [accessToken, refreshToken, expiresAt, userId], (err) => {
        if (err) {
          console.error('Error updating user with Spotify tokens:', err);
          return done(err);
        }
        return done(null, profile);
      });
    }
  )
);

// Serialize and deserialize user
passport.serializeUser(function (user, done) {
  done(null, user);
});

passport.deserializeUser(function (obj, done) {
  done(null, obj);
});

// Authentication routes
app.get('/auth/spotify', passport.authenticate('spotify', {
  scope: ['playlist-modify-public', 'playlist-modify-private'],
}));

app.get(
  '/auth/spotify/callback',
  passport.authenticate('spotify', { failureRedirect: '/login' }),
  function (req, res) {
    res.redirect('/dashboard?spotify=success');
  }
);



function getSpotifyApiForUser(userId) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT spotify_access_token, spotify_refresh_token, spotify_token_expires
      FROM users
      WHERE id = ?
    `;
    db.query(query, [userId], async (err, results) => {
      if (err) return reject(err);
      if (results.length === 0) return reject(new Error('User not found'));

      const user = results[0];

      const spotifyApi = new SpotifyWebApi({
        clientId: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
        redirectUri: process.env.SPOTIFY_CALLBACK_URL,
      });

      spotifyApi.setAccessToken(user.spotify_access_token);
      spotifyApi.setRefreshToken(user.spotify_refresh_token);

      // Check if access token has expired
      if (new Date() > new Date(user.spotify_token_expires)) {
        try {
          const data = await spotifyApi.refreshAccessToken();
          const newAccessToken = data.body['access_token'];
          const expiresIn = data.body['expires_in'];

          // Update user's access token and expiration in the database
          const expiresAt = new Date(Date.now() + expiresIn * 1000);

          const updateQuery = `
            UPDATE users
            SET spotify_access_token = ?, spotify_token_expires = ?
            WHERE id = ?
          `;
          db.query(updateQuery, [newAccessToken, expiresAt, userId], (err) => {
            if (err) return reject(err);
          });

          spotifyApi.setAccessToken(newAccessToken);
        } catch (error) {
          return reject(error);
        }
      }

      resolve(spotifyApi);
    });
  });
}
app.post('/exportPlaylist', isAuthenticated, async (req, res) => {
  const userId = req.session.userId;
  const conversationId = req.body.conversationId;

  try {
    // Get Spotify API client
    const spotifyApi = await getSpotifyApiForUser(userId);

    // Fetch the user's Spotify ID
    const meData = await spotifyApi.getMe();
    const spotifyUserId = meData.body.id;

    // Fetch the playlist from your database
    const selectPlaylistQuery = 'SELECT * FROM playlist WHERE conversation_id = ?';
    db.query(selectPlaylistQuery, [conversationId], async (err, playlistResults) => {
      if (err) {
        console.error('Error fetching playlist:', err);
        return res.status(500).json({ error: 'Server error' });
      }

      if (playlistResults.length === 0) {
        return res.status(400).json({ error: 'Playlist is empty' });
      }

    
      let playlistName = `BeatBuddy Playlist - ${new Date().toLocaleDateString()}`;

      

      // Create a new playlist in Spotify
      const createPlaylistData = await spotifyApi.createPlaylist(playlistName, {
        public: false,
      });

      const spotifyPlaylistId = createPlaylistData.body.id;

      // Prepare track URIs to add to the playlist
      const trackUris = [];

      for (const song of playlistResults) {
        try {
          // Search for the track on Spotify
          const searchData = await spotifyApi.searchTracks(
            `track:${song.song_title} artist:${song.song_artist}`,
            { limit: 1 }
          );

          if (searchData.body.tracks.items.length > 0) {
            const trackUri = searchData.body.tracks.items[0].uri;
            console.log(song.song_title + "Added to the playlist");
            trackUris.push(trackUri);
          } else {
            console.warn(`Track not found on Spotify: ${song.song_title} by ${song.song_artist}`);
          }
        } catch (searchError) {
          console.error('Error searching for track:', searchError);
        }
      }

      if (trackUris.length === 0) {
        return res.status(400).json({ error: 'No tracks found on Spotify to add to the playlist' });
      }

      // Add tracks to the playlist
      await spotifyApi.addTracksToPlaylist(spotifyPlaylistId, trackUris);

      console.log("Playlist successfully exported to spotify")
      res.json({ success: true, message: 'Playlist exported to Spotify successfully' });
    });
  } catch (error) {
    console.error('Error exporting playlist to Spotify:', error);
    res.status(500).json({ error: 'Failed to export playlist to Spotify' });
  }
});


// Check if the user is connected to Spotify
// Check if the user is connected to Spotify
app.get('/spotify/status', isAuthenticated, (req, res) => {
  const userId = req.session.userId;

  const query = `
    SELECT spotify_access_token, spotify_refresh_token
    FROM users
    WHERE id = ?
  `;
  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error('Error checking Spotify connection status:', err);
      return res.status(500).json({ error: 'Server error' });
    }

    if (results.length > 0) {
      const user = results[0];
      const isConnected = user.spotify_access_token && user.spotify_refresh_token;
      res.json({ isConnected: !!isConnected });
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  });
});






  // Dashboard route (protected)
app.get('/dashboard', (req, res) => {
    // Resets playlist data when the user logs in
    // initializeDataFiles();
    res.sendFile(path.join(__dirname, '..', 'public', 'chatApplication.html'));
  });



const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});