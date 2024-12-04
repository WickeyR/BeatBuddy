const express = require('express');
const OpenAI = require('openai'); // Your OpenAI integration
const bodyParser = require('body-parser');
const path = require('path');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const app = express();
const mysql = require('mysql2/promise');
const passport = require('passport');
const SpotifyStrategy = require('passport-spotify').Strategy;
const saltRounds = 10;
const session = require('express-session');
const { functionDefinitions, sanitizeMessages } = require('./openAIFunctions.js');
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

// Load environment variables
require('dotenv').config();

// Middleware setup
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Session configuration
const isSecure = process.env.NODE_ENV === 'production' && process.env.SECURE_COOKIE === 'true';

// Session configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true,        // Must be true if sameSite is 'none'
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24, // 1 day
      sameSite: 'none',    // none for deployment, lax for development
    },
  })
);
app.use(passport.initialize());
app.use(passport.session());

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1); // Trust the first proxy
}

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, '..', 'public')));



// Redirect to login page on root access
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

//--------------------------Connect to mysql database-----------------//

// Database information and password
const db = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  port: process.env.MYSQL_PORT,
});

// Test database connection
(async () => {
  try {
    const connection = await db.getConnection();
    await connection.ping();
    console.log('Connected to MySQL database.');
    connection.release();
  } catch (err) {
    console.error('Error connecting to MySQL database:', err);
    process.exit(1);
  }
})();

// Serve login.html for the login page
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

// Serve signup.html for the signup page
app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'signup.html'));
});

// Serve connectSpotify.html for the connectSpotify page
app.get('/connectSpotify', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'connectSpotify.html'));
});

//-------------------------- OpenAI API calls -----------------//

const openai = new OpenAI(process.env.OPENAI_API_KEY);

app.post('/api/messageGPT', async (req, res) => {
  try {
    const { userInput, conversationId } = req.body;
    const userId = req.session.userId;

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
    const [messages] = await db.query(selectMessagesQuery, [conversationId]);

    // Build conversation history in the format required by OpenAI
    const conversationHistory = messages.map((msg) => ({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.message_content,
    }));

    

     // **Fetch the current playlist for the conversation**
     const selectPlaylistQuery = 'SELECT song_title, song_artist FROM playlist WHERE conversation_id = ?';
     const [playlistResults] = await db.query(selectPlaylistQuery, [conversationId]);

     // Build the playlist text
    let playlistText = '';
    if (playlistResults.length > 0) {
      // Limit the number of songs to manage token usage
      const maxSongsToInclude = 10; // Adjust as needed
      const songsToInclude = playlistResults.slice(-maxSongsToInclude);
      playlistText = songsToInclude
        .map((song, index) => `${index + 1}. "${song.song_title}" by ${song.song_artist}`)
        .join('\n');
    } else {
      playlistText = 'The playlist is currently empty.';
    }

    // **Add the user's input to the conversation history**
    conversationHistory.push({ role: 'user', content: userInput });

    // Fetch the user's genres
    const selectGenresQuery = 'SELECT genre FROM user_genres WHERE user_id = ?';
    const [genresResults] = await db.query(selectGenresQuery, [userId]);

    // To grab user information
    const userGenres = genresResults.map((row) => row.genre);

    // Define the system prompt and add it to the message chain
    const systemPrompt = `
You are Beat Buddy, a music recommender. Guide the user and make playlists based on their inputs and suggestions.

Current playlist:
${playlistText}

User prefered genres:
${userGenres}

When making recommendations, avoid suggesting songs that are already in the playlist.
When the user is unsure on what to listen to, suggest songs based on their favorite genres or ask for their current mood.

**Formatting Instructions:**
- When listing songs, please format them as a numbered list with a seperate line for each.
- Each song should be on a new line.
- Include the song title and artist in the format: "Song Title" by Artist.
- When returning song information, only list the song title and aritst unless asked.
- Use markdown formatting if possible.
`;

    const aiMessages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
    ];

    // Sanitize messages before sending to OpenAI
    const sanitizedMessages = sanitizeMessages(aiMessages);

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
      const functionArgs = JSON.parse(responseMessage.function_call.arguments)

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
            conversationId, 
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

      // **Reconstruct aiMessages with the updated conversation history**
      const aiMessagesAfterFunction = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory,
      ];

      // Call the OpenAI API again with updated conversation history
      const completion2 = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: sanitizeMessages(aiMessagesAfterFunction),
        max_tokens: 175,
        temperature: 0.7,
      });

      const finalResponseMessage = completion2.choices[0].message.content;

      // Save AI's response and function results in the database
      const insertMessagesQuery = `
        INSERT INTO messages (conversation_id, sender, message_content) 
        VALUES (?, ?, ?), (?, ?, ?)
      `;
      await db.query(insertMessagesQuery, [
        conversationId,
        'user',
        userInput,
        conversationId,
        'bot',
        finalResponseMessage,
      ]);

      // Send the final response to the client
      res.json({ success: true, response: finalResponseMessage });
    } else {
      // If no function call, handle as usual
      const aiResponse = responseMessage.content;

      // Save the user's and AI's messages in the database
      const insertMessagesQuery = `
        INSERT INTO messages (conversation_id, sender, message_content)
        VALUES (?, ?, ?), (?, ?, ?)
      `;
      await db.query(insertMessagesQuery, [
        conversationId,
        'user',
        userInput,
        conversationId,
        'bot',
        aiResponse,
      ]);

      // Send AI's response to the client
      res.json({ success: true, response: aiResponse });
    }
  } catch (error) {
    console.error('Error in /api/messageGPT:', error);
    res.status(500).json({ success: false, error: 'Failed to generate response from OpenAI.' });
  }
});



// Get the playlist for a conversation
app.get('/conversations/:conversationId/playlist', isAuthenticated, async (req, res) => {
  const conversationId = req.params.conversationId;
  const userId = req.session.userId;

  try {
    // Verify that the conversation belongs to the user
    const verifyQuery = 'SELECT * FROM conversations WHERE conversation_id = ? AND user_id = ?';
    const [results] = await db.query(verifyQuery, [conversationId, userId]);

    if (results.length === 0) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Fetch the playlist for the conversation
    const selectPlaylistQuery = 'SELECT * FROM playlist WHERE conversation_id = ?';
    const [playlistResults] = await db.query(selectPlaylistQuery, [conversationId]);

    res.json(playlistResults);
  } catch (err) {
    console.error('Error fetching playlist:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a song from the playlist
app.delete('/conversations/:conversationId/playlist/:songId', isAuthenticated, async (req, res) => {
  const conversationId = req.params.conversationId;
  const songId = req.params.songId;
  const userId = req.session.userId;

  try {
    // Verify that the conversation belongs to the user
    const verifyQuery = 'SELECT * FROM conversations WHERE conversation_id = ? AND user_id = ?';
    const [results] = await db.query(verifyQuery, [conversationId, userId]);

    if (results.length === 0) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Delete the song from the playlist
    const deleteQuery = 'DELETE FROM playlist WHERE id = ? AND conversation_id = ?';
    await db.query(deleteQuery, [songId, conversationId]);

    res.json({ success: true, message: 'Song deleted from playlist.' });
  } catch (err) {
    console.error('Error deleting song from playlist:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Function to add to playlist
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
    const imageURL =
      trackInfo.album?.image.find((img) => img.size === 'extralarge')?.['#text'] || '';

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

    await db.query(insertQuery, values);
    console.log('Song added to playlist:', trackInfo.name);

    // Optionally, you can fetch and store suggested tracks here if needed

    return { message: 'Song added to playlist successfully.' };
  } catch (error) {
    console.error('Error adding song to playlist:', error);
    throw error;
  }
}


//--------------------------User Login and Signup Functions -----------------//

// API endpoint to get user information
app.get('/user', async (req, res) => {
  const userId = req.session.userId; // Retrieve the logged-in user's ID from the session

  try {
    const query = 'SELECT username FROM users WHERE id = ?'; // Query to fetch the username using the user's ID
    const [results] = await db.query(query, [userId]);

    if (results.length > 0) {
      const user = results[0];
      res.json({ username: user.username }); // Return the username as a JSON response
    } else {
      res.status(404).json({ error: 'User not found' }); // Handle the case where the user is not found
    }
  } catch (err) {
    console.error('Database error:', err);
    return res.status(500).json({ error: 'Server error' }); // Handle any server/database errors
  }
});

// Signup route
app.post('/signup', async (req, res) => {
  const { username, password, genres = [] } = req.body;

  try {
    // Check if username already exists
    const selectQuery = 'SELECT * FROM users WHERE username = ?';
    const [results] = await db.query(selectQuery, [username]);

    if (results.length > 0) {
      return res.status(400).send('Username already exists');
    }

    // Hash the password
    const hash = await bcrypt.hash(password, saltRounds);

    // Insert into 'users' table
    const insertUserQuery = `
      INSERT INTO users (username, password)
      VALUES (?, ?)
    `;
    const [userResult] = await db.query(insertUserQuery, [username, hash]);

    const userId = userResult.insertId;

    // Insert genres into 'user_genres' table
    if (genres.length > 0) {
      const insertGenresQuery = 'INSERT INTO user_genres (user_id, genre) VALUES ?';
      const genreValues = genres.map((genre) => [userId, genre]);
      await db.query(insertGenresQuery, [genreValues]);
    }

    // Set req.session.userId
    req.session.userId = userId;

    // Redirect to connectSpotify page
    res.redirect('/connectSpotify');
  } catch (err) {
    console.error('Error during signup:', err);
    res.status(500).send('Server error during signup');
  }
});


app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const selectQuery = 'SELECT * FROM users WHERE username = ?';
    const [results] = await db.query(selectQuery, [username]);

    if (results.length > 0) {
      const user = results[0];
      const match = await bcrypt.compare(password, user.password);

      if (match) {
        req.session.userId = user.id;
        res.redirect('/dashboard');
      } else {
        res.status(401).send('Invalid username or password');
      }
    } else {
      res.status(401).send('Invalid username or password');
    }
  } catch (err) {
    console.error('Error during login:', err);
    res.status(500).send('Server error');
  }
});

// Create a new conversation
app.post('/conversations', isAuthenticated, async (req, res) => {
  const userId = req.session.userId;
  const title = req.body.title || null;

  try {
    const insertQuery = 'INSERT INTO conversations (user_id, title) VALUES (?, ?)';
    const [result] = await db.query(insertQuery, [userId, title]);
    res.json({ conversation_id: result.insertId });
  } catch (err) {
    console.error('Error creating conversation:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Get all conversations for the user
app.get('/conversations', isAuthenticated, async (req, res) => {
  const userId = req.session.userId;

  try {
    const selectQuery = `
      SELECT c.*, DATE_FORMAT(c.start_time, '%Y-%m-%dT%H:%i:%sZ') AS start_time_utc 
      FROM conversations c 
      WHERE c.user_id = ? 
      ORDER BY c.start_time DESC;
    `;
    const [results] = await db.query(selectQuery, [userId]);

    // Map the results to include the ISO-formatted 'start_time'
    const conversations = results.map((conversation) => {
      return {
        ...conversation,
        start_time: conversation.start_time_utc,
      };
    });

    res.json(conversations);
  } catch (err) {
    console.error('Error fetching conversations:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Get messages for a conversation
app.get('/conversations/:conversationId/messages', isAuthenticated, async (req, res) => {
  const conversationId = req.params.conversationId;
  const userId = req.session.userId;

  try {
    // Verify that the conversation belongs to the user
    const verifyQuery = 'SELECT * FROM conversations WHERE conversation_id = ? AND user_id = ?';
    const [results] = await db.query(verifyQuery, [conversationId, userId]);

    if (results.length === 0) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const selectQuery = 'SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC';
    const [messages] = await db.query(selectQuery, [conversationId]);
    res.json(messages);
  } catch (err) {
    console.error('Error fetching messages:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Delete all conversations for the user
app.delete('/conversations', isAuthenticated, async (req, res) => {
  const userId = req.session.userId;

  try {
    // Delete messages associated with the user's conversations
    const deleteMessagesQuery = `
      DELETE m FROM messages m
      INNER JOIN conversations c ON m.conversation_id = c.conversation_id
      WHERE c.user_id = ?
    `;
    await db.query(deleteMessagesQuery, [userId]);

    // Delete playlists associated with the user's conversations
    const deletePlaylistsQuery = `
      DELETE p FROM playlist p
      INNER JOIN conversations c ON p.conversation_id = c.conversation_id
      WHERE c.user_id = ?
    `;
    await db.query(deletePlaylistsQuery, [userId]);

    // Delete the user's conversations
    const deleteConversationsQuery = 'DELETE FROM conversations WHERE user_id = ?';
    await db.query(deleteConversationsQuery, [userId]);

    res.json({ success: true, message: 'All conversations deleted successfully' });
  } catch (err) {
    console.error('Error deleting all conversations:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Delete a conversation
app.delete('/conversations/:conversationId', isAuthenticated, async (req, res) => {
  const conversationId = req.params.conversationId;
  const userId = req.session.userId;

  try {
    // Verify that the conversation belongs to the user
    const verifyQuery = 'SELECT * FROM conversations WHERE conversation_id = ? AND user_id = ?';
    const [results] = await db.query(verifyQuery, [conversationId, userId]);

    if (results.length === 0) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Delete messages associated with the conversation
    const deleteMessagesQuery = 'DELETE FROM messages WHERE conversation_id = ?';
    await db.query(deleteMessagesQuery, [conversationId]);

    // Delete the conversation
    const deleteConversationQuery = 'DELETE FROM conversations WHERE conversation_id = ?';
    await db.query(deleteConversationQuery, [conversationId]);

    res.json({ success: true, message: 'Conversation deleted successfully' });
  } catch (err) {
    console.error('Error deleting conversation:', err);
    return res.status(500).json({ error: 'Server error' });
  }
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
    async function (req, accessToken, refreshToken, expires_in, profile, done) {
      try {
        // Decode the state parameter to get the userId
        let userId;
        if (req.query && req.query.state) {
          const state = JSON.parse(Buffer.from(req.query.state, 'base64').toString('utf-8'));
          userId = state.userId;
        }

        if (!userId) {
          return done(new Error('User not authenticated.'));
        }

        const expiresAt = new Date(Date.now() + expires_in * 1000);

        // Update user's Spotify tokens in the database
        const updateQuery = `
          UPDATE users
          SET spotify_access_token = ?, spotify_refresh_token = ?, spotify_token_expires = ?
          WHERE id = ?
        `;
        await db.query(updateQuery, [accessToken, refreshToken, expiresAt, userId]);

        console.log('Spotify tokens stored in database for user:', userId);
        done(null, profile);
      } catch (err) {
        console.error('Error storing Spotify tokens:', err);
        done(err);
      }
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
app.get('/auth/spotify', (req, res, next) => {
  if (!req.session.userId) {
    // User is not authenticated, redirect to login
    return res.redirect('/login');
  }

app.get(
  '/auth/spotify/callback',
  passport.authenticate('spotify', { failureRedirect: '/signup' }),
  function (req, res) {
    // On success
    res.redirect('/dashboard');
  }
);


  // Encode the userId into the state parameter
  const state = Buffer.from(JSON.stringify({ userId: req.session.userId })).toString('base64');

  passport.authenticate('spotify', {
    scope: ['playlist-modify-public', 'playlist-modify-private'],
    state: state,
  })(req, res, next);
});

function getSpotifyApiForUser(userId) {
  return new Promise(async (resolve, reject) => {
    try {
      const query = `
        SELECT spotify_access_token, spotify_refresh_token, spotify_token_expires
        FROM users
        WHERE id = ?
      `;
      const [results] = await db.query(query, [userId]);

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
          await db.query(updateQuery, [newAccessToken, expiresAt, userId]);

          spotifyApi.setAccessToken(newAccessToken);
        } catch (error) {
          return reject(error);
        }
      }

      resolve(spotifyApi);
    } catch (err) {
      reject(err);
    }
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

    // Fetch the playlist from your database using promises
    const selectPlaylistQuery = 'SELECT * FROM playlist WHERE conversation_id = ?';
    const [playlistResults] = await db.query(selectPlaylistQuery, [conversationId]);

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
          console.log(`${song.song_title} added to the playlist`);
          trackUris.push(trackUri);
        } else {
          console.warn(`Track not found on Spotify: ${song.song_title} by ${song.song_artist}`);
        }
      } catch (searchError) {
        console.error('Error searching for track:', searchError);
      }
    }

    if (trackUris.length === 0) {
      return res
        .status(400)
        .json({ error: 'No tracks found on Spotify to add to the playlist' });
    }

    // Add tracks to the playlist
    await spotifyApi.addTracksToPlaylist(spotifyPlaylistId, trackUris);

    console.log('Playlist successfully exported to Spotify');

    // Include the playlist URL in the response
    const playlistUrl = createPlaylistData.body.external_urls.spotify;

    res.json({
      success: true,
      message: 'Playlist exported to Spotify successfully',
      playlistUrl,
    });
  } catch (error) {
    console.error('Error exporting playlist to Spotify:', error);
    res.status(500).json({ error: 'Failed to export playlist to Spotify' });
  }
});

// Check if the user is connected to Spotify
app.get('/spotify/status', isAuthenticated, async (req, res) => {
  const userId = req.session.userId;

  try {
    const query = `
      SELECT spotify_access_token, spotify_refresh_token
      FROM users
      WHERE id = ?
    `;
    const [results] = await db.query(query, [userId]);

    if (results.length > 0) {
      const user = results[0];
      const isConnected = user.spotify_access_token && user.spotify_refresh_token;
      res.json({ isConnected: !!isConnected });
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } catch (err) {
    console.error('Error checking Spotify connection status:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Dashboard route (protected)
app.get('/dashboard', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'chatApplication.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});

//------------------------- lastfm  proxy--------------------------------
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
          const extraLargeImage =
            trackInfo.album?.image.find((img) => img.size === 'extralarge')?.['#text'];

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


//-------------- playlist functions ---------------
// Get suggested songs for a conversation
app.get('/conversations/:conversationId/suggestions', isAuthenticated, async (req, res) => {
  const conversationId = req.params.conversationId;
  const userId = req.session.userId;

  try {
    // Verify that the conversation belongs to the user
    const verifyQuery = 'SELECT * FROM conversations WHERE conversation_id = ? AND user_id = ?';
    const [results] = await db.query(verifyQuery, [conversationId, userId]);

    if (results.length === 0) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Fetch the playlist for the conversation
    const selectPlaylistQuery = 'SELECT * FROM playlist WHERE conversation_id = ?';
    const [playlistResults] = await db.query(selectPlaylistQuery, [conversationId]);

    if (playlistResults.length === 0) {
      return res.json([]); // No songs in playlist, return empty suggestions
    }

    const maxSuggestions = 5;
    let suggestions = [];
    const seenTracks = new Set();
    const playlistTrackIds = new Set(playlistResults.map(song => song.song_title + ' - ' + song.song_artist));

    for (const song of playlistResults) {
      if (suggestions.length >= maxSuggestions) break;

      const similarTracks = await getRelatedTracks(song.song_artist, song.song_title, maxSuggestions, process.env.LAST_FM_API_KEY);

      for (const similar of similarTracks) {
        const trackId = similar.songTitle + ' - ' + similar.artist;
        if (!playlistTrackIds.has(trackId) && !seenTracks.has(trackId)) {
          seenTracks.add(trackId);
          suggestions.push(similar);
        }
        if (suggestions.length >= maxSuggestions) break;
      }
      if (suggestions.length >= maxSuggestions) break;
    }

    res.json(suggestions.slice(0, maxSuggestions));

  } catch (err) {
    console.error('Error fetching suggestions:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add a song to the playlist (from suggestions)
app.post('/conversations/:conversationId/playlist', isAuthenticated, async (req, res) => {
  const conversationId = req.params.conversationId;
  const userId = req.session.userId;
  const { songTitle, artist } = req.body;

  try {
    // Verify that the conversation belongs to the user
    const verifyQuery = 'SELECT * FROM conversations WHERE conversation_id = ? AND user_id = ?';
    const [results] = await db.query(verifyQuery, [conversationId, userId]);

    if (results.length === 0) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Add song to the playlist
    await addToPlaylist(conversationId, songTitle, artist);

    res.json({ success: true, message: 'Song added to playlist' });
  } catch (err) {
    console.error('Error adding song to playlist:', err);
    res.status(500).json({ error: 'Server error' });
  }
});