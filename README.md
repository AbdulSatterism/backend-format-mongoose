# Backend Format - Prisma & PostgreSQL

A backend starter template built with Express.js, Prisma ORM, and PostgreSQL.

## Tech Stack

- **Node.js** & **Express.js** - Server framework
- **TypeScript** - Type-safe code
- **Prisma** - Modern ORM for database access
- **PostgreSQL** - Relational database
- **JWT** - Authentication
- **Zod** - Schema validation
- **Socket.io** - Real-time communication

## Prerequisites

- Node.js (v18 or higher)
- PostgreSQL (v14 or higher)
- npm or yarn

## Setup Instructions

1. **Clone the repository**
   ```bash
   git clone https://github.com/AbdulSatterism/backend-format-prisma.git
   cd backend-format-prisma
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   
   Create a `.env` file in the root directory:
   ```env
   DATABASE_URL="postgresql://username:password@localhost:5432/dbname"
   NODE_ENV=development
   PORT=5000
   IP_ADDRESS=localhost
   BCRYPT_SALT_ROUNDS=10
   
   JWT_SECRET=your_jwt_secret
   JWT_EXPIRE_IN=7d
   JWT_REFRESH_SECRET=your_refresh_secret
   JWT_REFRESH_EXPIRES_IN=30d
   
   ADMIN_EMAIL=admin@example.com
   ADMIN_PASSWORD=securepassword
   
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_USER=your_email@gmail.com
   EMAIL_PASS=your_app_password
   EMAIL_FROM=noreply@example.com
   ```

4. **Set up database**
   ```bash
   # Generate Prisma Client
   npm run prisma:generate
   
   # Run database migrations
   npm run prisma:migrate
   
   # (Optional) Open Prisma Studio to view your data
   npm run prisma:studio
   ```

5. **Run the application**
   
   Development mode:
   ```bash
   npm run dev
   ```
   
   Production mode:
   ```bash
   npm run build
   npm start
   ```

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint errors
- `npm run prettier` - Format code with Prettier
- `npm run prisma:generate` - Generate Prisma Client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:studio` - Open Prisma Studio

## Project Structure

```
src/
├── app/
│   ├── builder/       # Query builder utilities
│   ├── errors/        # Error handlers
│   ├── middlewares/   # Express middlewares
│   └── modules/       # Feature modules
├── config/            # Configuration files
├── lib/               # Prisma client setup
├── helpers/           # Utility functions
├── types/             # TypeScript types
└── server.ts          # Application entry point
```

## Features

- ✅ User authentication (JWT)
- ✅ Social login (Google, Facebook, Apple)
- ✅ Email verification
- ✅ Password reset
- ✅ File upload
- ✅ Real-time updates with Socket.io
- ✅ Type-safe database queries with Prisma
- ✅ Request validation with Zod
- ✅ Error handling middleware
- ✅ Logging with Winston

## Database Migrations

When you make changes to the Prisma schema:

```bash
# Create a new migration
npm run prisma:migrate

# Reset database (caution: deletes all data)
npx prisma migrate reset

# Deploy migrations to production
npx prisma migrate deploy
```

## License

ISC

