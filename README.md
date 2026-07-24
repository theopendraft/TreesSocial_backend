# Treesh Social Media Platform - Backend API

A comprehensive backend API for the Treesh social media and live streaming platform, built with Node.js, Express, and MongoDB.

## 🚀 Features

### Core Features
- **User Authentication & Authorization** - JWT-based auth with username/email login
- **User Management** - Profile management, settings, preferences
- **Content Management** - Posts, stories, reels, live streams
- **Social Features** - Following, followers, interactions
- **Real-time Communication** - WebSocket-based chat and notifications

### Advanced Features
- **Arcade Matching System** - Tinder-like matching with preferences
- **Streamer Subscriptions** - Tier-based subscription system
- **Secure Chat System** - PIN-protected conversations
- **User Reporting** - Comprehensive reporting and moderation system
- **Admin Panel** - Full administrative controls

## 🏗️ Architecture

### Technology Stack
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (JSON Web Tokens)
- **Real-time**: Socket.IO
- **Validation**: Express-validator
- **Security**: Helmet, CORS, Rate Limiting

### Project Structure
```
backend/
├── models/           # Database models
├── routes/           # API route handlers
├── middleware/       # Custom middleware
├── test/            # Test files
├── server.js        # Main server file
└── package.json     # Dependencies
```

## 📊 Database Models

### Core Models
- **User** - User accounts and profiles
- **UserSettings** - User preferences and settings
- **UserPreference** - Matching preferences for Arcade
- **UserInteraction** - User interactions (likes, dislikes, matches)
- **Post** - User posts and content
- **Stream** - Live streaming sessions
- **Message** - Chat messages
- **Chat** - Chat conversations with PIN protection

### Feature Models
- **Subscription** - Streamer subscription management
- **StreamerTier** - Subscription tier configurations
- **Payment** - Payment transactions and history
- **UserReport** - User reporting system
- **Notification** - User notifications
- **AdminLog** - Administrative action logs

## 🔌 API Endpoints

### Authentication (`/api/auth`)
- `POST /register` - User registration
- `POST /login` - User login
- `POST /logout` - User logout
- `POST /refresh` - Refresh JWT token
- `POST /forgot-password` - Password reset request
- `POST /reset-password` - Password reset
- `GET /check-username/:username` - Username availability check

### Users (`/api/users`)
- `GET /profile` - Get user profile
- `PUT /profile` - Update user profile
- `GET /:userId` - Get public user profile
- `POST /follow/:userId` - Follow a user
- `DELETE /follow/:userId` - Unfollow a user
- `GET /followers` - Get user followers
- `GET /following` - Get user following

### Settings (`/api/settings`)
- `GET /` - Get user settings
- `PUT /account` - Update account settings
- `PUT /privacy` - Update privacy settings
- `PUT /notifications` - Update notification settings
- `PUT /app` - Update app preferences
- `PUT /all` - Update all settings at once
- `POST /reset` - Reset to default settings
- `GET /export` - Export settings data

### Arcade (`/api/arcade`)
- `GET /preferences` - Get user preferences
- `PUT /preferences` - Update user preferences
- `GET /matches/potential` - Get potential matches
- `POST /like/:userId` - Like a user
- `POST /super-like/:userId` - Super like a user
- `POST /dislike/:userId` - Dislike a user
- `POST /pass/:userId` - Pass on a user
- `GET /matches` - Get user matches
- `GET /interactions` - Get interaction history
- `GET /stats` - Get user statistics
- `POST /block/:userId` - Block a user
- `POST /unblock/:userId` - Unblock a user
- `GET /blocked` - Get blocked users

### Chat (`/api/chat`)
- `GET /` - Get user chats
- `GET /:chatId` - Get chat with PIN verification
- `POST /create` - Create new chat for match
- `POST /:chatId/messages` - Send message (PIN required)
- `GET /:chatId/messages` - Get chat messages (PIN required)
- `POST /:chatId/messages/:messageId/pin` - Pin/unpin message
- `POST /:chatId/read` - Mark chat as read
- `POST /:chatId/leave` - Leave chat
- `GET /:chatId/pin` - Get PIN hint
- `POST /:chatId/reset-pin` - Reset chat PIN

### Subscriptions (`/api/subscriptions`)
- `GET /` - Get user subscriptions
- `POST /` - Create subscription
- `PUT /:id` - Update subscription
- `DELETE /:id` - Cancel subscription
- `GET /tiers` - Get available tiers
- `POST /gift` - Gift subscription
- `GET /history` - Get subscription history

### Reports (`/api/reports`)
- `POST /` - Report a user
- `GET /my-reports` - Get user's report history
- `GET /against/:userId` - Get reports against user (admin)
- `GET /all` - Get all reports (admin)
- `GET /high-priority` - Get high priority reports (admin)
- `PUT /:reportId/status` - Update report status (admin)
- `PUT /:reportId/action` - Take action on report (admin)
- `GET /stats` - Get report statistics (admin)
- `GET /:reportId` - Get report details

### Posts (`/api/posts`)
- `GET /` - Get posts feed
- `POST /` - Create new post
- `GET /:id` - Get post details
- `PUT /:id` - Update post
- `DELETE /:id` - Delete post
- `POST /:id/like` - Like post
- `POST /:id/comment` - Comment on post
- `POST /:id/share` - Share post

### Streams (`/api/streams`)
- `GET /` - Get live streams
- `POST /` - Start live stream
- `PUT /:id` - Update stream
- `DELETE /:id` - End stream
- `POST /:id/join` - Join stream
- `POST /:id/leave` - Leave stream
- `POST /:id/chat` - Send stream chat message

## 🔐 Authentication & Security

### JWT Authentication
- Access tokens with configurable expiration
- Refresh token rotation
- Secure token storage

### Security Features
- Password hashing with bcrypt
- Rate limiting on all endpoints
- CORS protection
- Helmet security headers
- Input validation and sanitization
- SQL injection prevention

### User Roles
- **User** - Regular platform user
- **Moderator** - Content moderation privileges
- **Admin** - Full administrative access

## 💾 Database Features

### Indexing
- Optimized queries with MongoDB indexes
- Efficient user matching algorithms
- Fast content retrieval

### Data Validation
- Mongoose schema validation
- Custom validation functions
- Data integrity checks

## 🔄 Real-time Features

### WebSocket Events
- User online/offline status
- Real-time chat messages
- Live stream interactions
- Push notifications

### Socket.IO Integration
- Authenticated socket connections
- Room-based chat system
- Event-driven architecture

## 🧪 Testing

### Test Setup
- Jest testing framework
- Supertest for API testing
- MongoDB test database
- Comprehensive test coverage

### Test Commands
```bash
npm test              # Run all tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage
```

## 🚀 Deployment

### Environment Variables
Create a `.env` file with the following variables:
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/treesh
JWT_SECRET=your-secret-key
FRONTEND_URL=http://localhost:5173
```

### Production Setup
1. Set `NODE_ENV=production`
2. Configure MongoDB Atlas or production database
3. Set up SSL certificates
4. Configure reverse proxy (Nginx)
5. Set up monitoring and logging

### Docker Support
```bash
# Build image
docker build -t treesh-backend .

# Run container
docker run -p 5000:5000 treesh-backend
```

## 📈 Performance

### Optimization Features
- Database query optimization
- Response compression
- Rate limiting
- Efficient pagination
- Caching strategies

### Monitoring
- Request logging with Morgan
- Error tracking
- Performance metrics
- Health check endpoints

## 🔧 Development

### Prerequisites
- Node.js 16+
- MongoDB 5+
- npm or yarn

### Installation
```bash
# Clone repository
git clone <repository-url>
cd backend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

# Start development server
npm run dev

# Run tests
npm test
```

### Code Quality
- ESLint configuration
- Prettier formatting
- Consistent code style
- Comprehensive error handling

## 🤝 Contributing

### Development Guidelines
1. Follow existing code patterns
2. Add comprehensive tests
3. Update documentation
4. Use conventional commit messages
5. Create feature branches

### Code Review Process
1. Create pull request
2. Ensure all tests pass
3. Code review by maintainers
4. Merge after approval

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check the documentation

## 🔮 Future Enhancements

### Planned Features
- Advanced matching algorithms
- AI-powered content recommendations
- Enhanced security features
- Performance optimizations
- Additional payment gateways
- Social media integrations

---

**Built with ❤️ by the Treesh Development Team**
