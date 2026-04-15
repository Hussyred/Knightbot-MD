const axios = require('axios');

const TMDB_API_KEY = '6167aff9070a34811bc1d5ee4756a167';
const TMDB_BASE = 'https://api.themoviedb.org/3';

// Genre mapping
const genres = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
    80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
    14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
    9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 53: 'Thriller',
    10752: 'War', 37: 'Western'
};

async function movieCommand(sock, chatId, message, args) {
    try {
        let genre = args[0] ? args[0].toLowerCase() : 'popular';
        
        let url = '';
        
        if (genre === 'popular') {
            url = `${TMDB_BASE}/movie/popular?api_key=${TMDB_API_KEY}&language=en-US&page=1`;
        } else if (genre === 'top' || genre === 'toprated') {
            url = `${TMDB_BASE}/movie/top_rated?api_key=${TMDB_API_KEY}&language=en-US&page=1`;
        } else if (genre === 'upcoming') {
            url = `${TMDB_BASE}/movie/upcoming?api_key=${TMDB_API_KEY}&language=en-US&page=1`;
        } else {
            // Search by genre
            let genreId = '';
            if (genre === 'action') genreId = 28;
            else if (genre === 'comedy') genreId = 35;
            else if (genre === 'horror') genreId = 27;
            else if (genre === 'romance') genreId = 10749;
            else if (genre === 'drama') genreId = 18;
            else if (genre === 'sci-fi' || genre === 'scifi') genreId = 878;
            else if (genre === 'thriller') genreId = 53;
            else if (genre === 'animation') genreId = 16;
            else genreId = 'popular';
            
            if (genreId !== 'popular') {
                url = `${TMDB_BASE}/discover/movie?api_key=${TMDB_API_KEY}&with_genres=${genreId}&language=en-US&page=1`;
            } else {
                url = `${TMDB_BASE}/movie/popular?api_key=${TMDB_API_KEY}&language=en-US&page=1`;
            }
        }
        
        const response = await axios.get(url);
        const movies = response.data.results;
        
        if (!movies || movies.length === 0) {
            await sock.sendMessage(chatId, { text: '❌ No movies found.' }, { quoted: message });
            return;
        }
        
        const randomMovie = movies[Math.floor(Math.random() * movies.length)];
        
        // Get genre names
        const movieGenres = randomMovie.genre_ids.map(id => genres[id] || 'Unknown').join(', ');
        
        const result = `🎬 *MOVIE RECOMMENDATION*\n\n` +
                      `📽️ *Title:* ${randomMovie.title}\n` +
                      `📅 *Year:* ${randomMovie.release_date ? randomMovie.release_date.split('-')[0] : 'N/A'}\n` +
                      `🎭 *Genre:* ${movieGenres}\n` +
                      `⭐ *Rating:* ${randomMovie.vote_average}/10\n` +
                      `📝 *Description:* ${randomMovie.overview || 'No description available.'}\n\n` +
                      `🎟️ Enjoy!`;
        
        await sock.sendMessage(chatId, { text: result }, { quoted: message });
        
    } catch (error) {
        console.error('Error in movie command:', error);
        await sock.sendMessage(chatId, { text: '❌ Error fetching movie recommendation. Please try again later.' }, { quoted: message });
    }
}

module.exports = { movieCommand };
