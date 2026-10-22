FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm ci

COPY . .

# We use NEXT_PUBLIC_WS_URL injected at build/runtime.
# Next.js standalone output could be used, but since docker-compose
# often mounts volumes or runs `npm run dev` in dev mode,
# we'll default to a simple npm start for prod if built, or override in compose.
CMD ["npm", "run", "dev"]
