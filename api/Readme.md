# API

## Helpful commands

```bash
# Database migrations
npx prisma migrate dev     # Create a new migration in development
npx prisma migrate deploy  # Apply migrations in production
npx prisma migrate reset  # Reset the database
npx prisma db push       # Push schema changes without migrations

# Development
npx prisma studio       # Open Prisma Studio to view/edit data
npx prisma generate     # Generate Prisma Client after schema changes

# Building and running
npm run build
npm run start
```