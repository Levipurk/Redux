import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.creditBundle.createMany({
    data: [
      {
        name: "Starter",
        credits: 100,
        price: 500,
        stripePriceId: "price_1TEzxJIMeMFioHjPoiwBdZux",
        isActive: true,
      },
      {
        name: "Basic",
        credits: 250,
        price: 1000,
        stripePriceId: "price_1TEzxaIMeMFioHjPlmASRnc2",
        isActive: true,
      },
      {
        name: "Pro",
        credits: 600,
        price: 2000,
        stripePriceId: "price_1TEzxyIMeMFioHjP1lgy6kZC",
        isActive: true,
      },
      {
        name: "Advanced",
        credits: 1600,
        price: 5000,
        stripePriceId: "price_1TEzyFIMeMFioHjPZnXQyRkU",
        isActive: true,
      },
      {
        name: "Enterprise",
        credits: 3500,
        price: 10000,
        stripePriceId: "price_1TEzyUIMeMFioHjPKftj9PYX",
        isActive: true,
      },
    ],
  });

  console.log("Credit bundles seeded successfully");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });