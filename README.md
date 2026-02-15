# 🎮 HackTycoon - Slack Bot Game

An addictive idle/grinding game for Slack! Earn Hack Coins (HC), rob other players, gamble on slots, and build your empire.

##  Features

### Core Gameplay
- **/work** - Grind and earn HC with daily streaks (5min cooldown)
- ** /bal** - Check wallet & bank balance
- ** Banking** - Deposit/withdraw to protect money from robbers
- ** /shop** - Buy items that boost your earnings

### Gambling & PvP
- **🎰 /pitch** - Animated slot machine with 4 symbols
- **🔫 /rob @user <amount>** - Steal from other players (50% success, 2x penalty if caught)
- **🪙 /coinflip <amount>** - Solo 50/50 gambling
- **⚔️ /coinflip @user <amount>** - Challenge others to PvP duels

### Progression System
- **Daily Streaks** - Earn bonus HC for consecutive work days
- **Shop Items** - 7 items with passive bonuses:
  - Coffee Machine: -1min cooldown
  - MacBook Pro: +15% earnings
  - Herman Miller Chair: +5% rare chance
  - 4K Monitor: +10% earnings
  - Standing Desk: +25% streak bonuses
  - AirPods Max: +5% slot luck
  - Mechanical Keyboard: +50 HC flat bonus

##  Quick Start

### Prerequisites
- Node.js 20+
- A Slack workspace where you have admin access

### Local Development

1. **Clone and Install**
   ```bash
   git clone <your-repo>
   cd HackTycoon
   npm install
   ```

2. **Set up Slack App**
   - Go to https://api.slack.com/apps → Create New App
   - Enable Socket Mode
   - Add Bot Token Scopes: `chat:write`, `commands`, `users:read`
   - Create slash commands: `/work`, `/bal`, `/shop`, `/pitch`, `/rob`, `/coinflip`, `/help`
   - Install to workspace

3. **Environment Variables**
   Create `.env` file:
   ```env
   SLACK_BOT_TOKEN=xoxb-your-bot-token
   SLACK_SIGNING_SECRET=your-signing-secret
   SLACK_APP_TOKEN=xapp-your-app-token
   DATABASE_URL="file:./dev.db"
   ```

4. **Database Setup**
   ```bash
   npx prisma migrate dev --name init
   npx prisma generate
   ```

5. **Run**
   ```bash
   npm run dev
   ```

##  Deployment

See **[DEPLOY.md](./DEPLOY.md)** for complete Fly.io deployment instructions.

**TL;DR:**
```bash
# Install Fly CLI
fly auth login

# Launch app
fly launch --no-deploy

# Create volume
fly volumes create hack_tycoon_data --size 1 --region sjc

# Set secrets
fly secrets set SLACK_BOT_TOKEN="..." SLACK_SIGNING_SECRET="..." SLACK_APP_TOKEN="..."

# Deploy
fly deploy
```

##  Game Mechanics

### Work System
- 5-minute cooldown (4min with Coffee Machine)
- Rarity tiers: Common (70%), Uncommon (20%), Rare (8%), Epic (1.5%), Legendary (0.5%)
- Earnings: 50-15,000 HC based on rarity
- Streak bonuses: Day 7 (+500 HC), Day 30 (+5,000 HC), Day 100 (+50,000 HC)

### Robbery System
- 50% success rate
- 10-minute cooldown
- Can't rob same person for 1 hour
- If caught: lose 2x the amount
- Only steals from wallet (bank is safe!)

### Slot Machine
- 4 symbols: Diamond (2x), Trophy (3x), Heart (1.5x), Star (5x/10x jackpot)
- 3 matching = full multiplier
- 2 matching = half multiplier
- Animated reels (1.8s spin)

### Coinflip
- **Solo**: Pure 50/50 odds, 10s cooldown
- **PvP**: Winner takes pot minus 5% house fee, requires acceptance

## Project Structure

```
HackTycoon/
├── src/
│   ├── commands/         # Slash command handlers
│   │   ├── work.ts
│   │   ├── balance.ts
│   │   ├── shop.ts
│   │   ├── pitch.ts      # Slot machine
│   │   ├── rob.ts
│   │   ├── coinflip.ts
│   │   └── banking.ts    # Deposit/withdraw
│   ├── database/
│   │   └── queries.ts    # Prisma helpers
│   ├── utils/
│   │   └── itemEffects.ts # Shop item bonuses
│   └── app.ts            # Main app entry
├── prisma/
│   ├── schema.prisma     # Database schema
│   └── dev.db            # SQLite database
├── fly.toml              # Fly.io config
├── Dockerfile            # Container config
└── package.json
```

## Tech Stack

- **Runtime**: Node.js + TypeScript
- **Framework**: Slack Bolt
- **Database**: SQLite + Prisma ORM
- **Deployment**: Fly.io (free tier)
- **UI**: Slack Block Kit

**Enjoy the grind!**
