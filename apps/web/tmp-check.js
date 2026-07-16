const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.$connect()
  .then(() => {
    console.log('connected');
    return prisma.$disconnect();
  })
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
