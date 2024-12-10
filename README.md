# BeatBuddy
Beatbuddy is a Node.js web application that recommends music using the Last.fm API and integrates with OpenAI's GPT model to provide users with conversational recommendations. It also offers functionality to  create customized playlists that can be exported to Spotify.

### Features
- **User Authentication**: Uses a MySQL database to allow users to create an account and login
- **Music Recommendations**: Chat with an AI that is equipped with data from last.fm to suggest songs based on your mood, favorite genres and more.
- **Playlist Management**: Add, remove and build playlists. Suggestions and related songs can be added as well to build your playlist quicker.
- **Spotify Integration**: connect your Spotify account to export playlist created in the app directly to Spotify.

## Using The Website: 
This is the best way to use BeatBuddy! It can be accessed anytime  [Here](https://beatbuddy.us/)
	*Note: Due to our app currently being in development mode, we need to add your Spotify account on the backend in order to use the website as intended. If you would like to use BeatBuddy, please email me at rifranco@cpp.edu with your name and email associated with your Spotify account*





## Using the application on localhost:
using the application on localhost is also possible, however it requires your to download and setup the mysql server on your computer, as well as creating and setting the proper API keys.



### Prerequisites

-   **Node.js and npm**: Install Node.js if you haven't already.
-   **MySQL Database**: This application uses MySQL to store user accounts, playlists, and conversation histories. You must have a running MySQL instance accessible to the app.
-   **Last.fm API Key**: Create a Last.fm account and register an application to obtain an API key.
-   **OpenAI API Key**: Create an account with OpenAI and get an API key.
-   **Spotify Developer Account and Credentials**: Create a Spotify Developer account and register an app to obtain a Client ID and Client Secret.


### Environment Variables

Create a `.env` file in the root directory and populate it with the following keys:

    LAST_FM_API_KEY='your_lastfm_api_key_here'
    OPENAI_API_KEY='your_openai_api_key_here'
    MYSQL_HOST='your_mysql_host'
    MYSQL_PORT='your_mysql_port'
    MYSQL_USER='your_mysql_user'
    MYSQL_PASSWORD='your_mysql_password'
    MYSQL_DATABASE='your_mysql_database'
    SESSION_SECRET='your_super_secret_key'
    
    SPOTIFY_CLIENT_ID='your_spotify_client_id'
    SPOTIFY_CLIENT_SECRET='your_spotify_client_secret'
    
    NODE_ENV='development'
    LOCAL_REDIRECT_URI='http://localhost:8080/auth/spotify/callback'
    PRODUCTION_REDIRECT_URI='https://your-production-url/auth/spotify/callback'
    
    SPOTIFY_CALLBACK_URL='${NODE_ENV === "production" ? PRODUCTION_REDIRECT_URI : LOCAL_REDIRECT_URI}'

### Installation

1.  Clone the repository:
     `git clone https://github.com/WickeyR/BeatBuddy.git
        cd BeatBuddy`
2. Install Dependencies:
	`npm install`
3. Run the schema file against your local MYSQL instance
`mysql -h localhost -u your_user -p your_database < schema.sql`

### Running the Application

To run the application in development mode:

    node backend/server.js

