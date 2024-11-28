const functionDefinitions = [
    {
      name: 'searchTrack',
      description: 'Searches for tracks based on a song title.',
      parameters: {
        type: 'object',
        properties: {
          apiKey: {
            type: 'string',
            description: 'The Last.fm API key required for authentication.',
          },
          songTitle: {
            type: 'string',
            description: 'The title of the song to search for.',
          },
          limit: {
            type: 'integer',
            description: 'The number of tracks to return (default is 5).',
            default: 5,
          },
        },
        required: ['apiKey', 'songTitle'],
      },
    },
    {
      name: 'getTrackInfo',
      description: 'Retrieves detailed information about a specific track.',
      parameters: {
        type: 'object',
        properties: {
          apiKey: {
            type: 'string',
            description: 'The Last.fm API key required for authentication.',
          },
          artist: {
            type: 'string',
            description: 'The name of the artist.',
          },
          songTitle: {
            type: 'string',
            description: 'The title of the song.',
          },
        },
        required: ['apiKey', 'artist', 'songTitle'],
      },
    },
    {
      name: 'getRelatedTracks',
      description: 'Searches for similar tracks, returns ONLY the name of the song and the artist.',
      parameters: {
        type: 'object',
        properties: {
          apiKey: {
            type: 'string',
            description: 'The Last.fm API key required for authentication.',
          },
          artist: {
            type: 'string',
            description: 'The name of the artist.',
          },
          songTitle: {
            type: 'string',
            description: 'The title of the song to search for.',
          },
          limit: {
            type: 'integer',
            description: 'The number of tracks to return (default is 5).',
            default: 5,
          },
        },
        required: ['apiKey', 'artist', 'songTitle'],
      },
    },
    {
      name: 'getTagsTopTracks',
      description: 'Search the top tracks related to a particular mood/genre/tag. Returns ONLY the name of the song and the artist.',
      parameters: {
        type: 'object',
        properties: {
          apiKey: {
            type: 'string',
            description: 'The Last.fm API key required for authentication.',
          },
          tag: {
            type: 'string',
            description: 'The tag related to a track.',
          },
          limit: {
            type: 'integer',
            description: 'The number of tracks to return (default is 5).',
            default: 5,
          },
        },
        required: ['apiKey', 'tag'],
      },
    },
    {
      name: 'getTagsTopArtists',
      description: 'Search the top artists related to a particular mood/genre/tag.',
      parameters: {
        type: 'object',
        properties: {
          apiKey: {
            type: 'string',
            description: 'The Last.fm API key required for authentication.',
          },
          tag: {
            type: 'string',
            description: 'The tag related to an artist.',
          },
          limit: {
            type: 'integer',
            description: 'The number of artists to return (default is 5).',
            default: 5,
          },
        },
        required: ['apiKey', 'tag'],
      },
    },
    {
        name: 'searchAlbum',
        description: 'Search for albums of the title provided',
        parameters: {
          type: 'object',
          properties: {
            apiKey: {
                type: 'string',
                description: 'The Last.fm API key required for authentication.',
              },
            albumTitle: {
              type: 'string',
              description: 'The title of the album.',
            },
            
            limit: {
              type: 'integer',
              description: 'The number of tracks to return (default is 5).',
              default: 5,
            },
          },
          required: ['api_key', 'albumTitle'],
        },
      },
    {
        name: 'getAlbumInfo',
        description: 'Search for information about a particular album by an artist',
        parameters: {
          type: 'object',
          properties: {
            apiKey: {
                type: 'string',
                description: 'The Last.fm API key required for authentication.',
              },
            artist: {
              type: 'string',
              description: 'The artist of the album.',
            },
            albumTitle: {
              type: 'string',
              description: 'The title of the album.',
            },
          },
          required: ['api_key', 'artist', 'albumTitle'],
        },
      },
    {
      name: 'getChartTopArtists',
      description: 'Search and return the name of the current top charting artists.',
      parameters: {
        type: 'object',
        properties: {
          apiKey: {
            type: 'string',
            description: 'The Last.fm API key required for authentication.',
          },
          limit: {
            type: 'integer',
            description: 'The number of artists to return (default is 5).',
            default: 5,
          },
        },
        required: ['apiKey'],
      },
    },
    {
      name: 'getChartTopTags',
      description: 'Search and return the name of the current top genres.',
      parameters: {
        type: 'object',
        properties: {
          apiKey: {
            type: 'string',
            description: 'The Last.fm API key required for authentication.',
          },
          limit: {
            type: 'integer',
            description: 'The number of genres to return (default is 5).',
            default: 5,
          },
        },
        required: ['apiKey'],
      },
    },
    {
      name: 'getChartTopTracks',
      description: 'Search and return the name of the current top charting tracks.',
      parameters: {
        type: 'object',
        properties: {
          apiKey: {
            type: 'string',
            description: 'The Last.fm API key required for authentication.',
          },
          limit: {
            type: 'integer',
            description: 'The number of tracks to return (default is 5).',
            default: 5,
          },
        },
        required: ['apiKey'],
      },
    },
  
        {
          name: 'printPlaylist',
          description: 'Prints ONLY the song title and the artist of a song',
          parameters: {
            type: 'object',
            properties: {},
          },
        }, 
        {
          name: 'addToPlaylist',
          description: 'Adds a song to the current conversation’s playlist.',
          parameters: {
            type: 'object',
            properties: {
              songTitle: { type: 'string', description: 'Title of the song.' },
              artist: { type: 'string', description: 'Artist of the song.' },
            },
            required: ['songTitle', 'artist'],
          },
        },
  ];


/**
 * Sanitizes messages before passing them to OpenAI API
 * @param {Array} messages - Array of messages to be sanitized
 * @returns {Array} Array of sanitized messages
 */
function sanitizeMessages(messages) {
    return messages.map((msg) => {
      let sanitizedMsg = { role: msg.role };
  
      if (msg.content !== undefined && msg.content !== null) {
        sanitizedMsg.content = msg.content;
      }
  
      if (msg.name) {
        sanitizedMsg.name = msg.name;
      }
  
      if (msg.function_call) {
        sanitizedMsg.function_call = msg.function_call;
      }
  
      return sanitizedMsg;
    });
  }



  module.exports = {
    functionDefinitions,
    sanitizeMessages
  };