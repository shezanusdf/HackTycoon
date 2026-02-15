import { App } from '@slack/bolt';
import dotenv from 'dotenv';
import { handleWork } from './commands/work';
import { handleBalance } from './commands/balance';
import { handlePitch } from './commands/pitch';
import { handleShop, handleShopPurchase } from './commands/shop';
import { handleDeposit, handleWithdraw, handleDepositSubmit, handleWithdrawSubmit } from './commands/banking';


dotenv.config()

const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    socketMode: true,
    appToken: process.env.SLACK_APP_TOKEN,
});

// slack commands
app.command('/work', handleWork);
app.command('/bal', handleBalance);
app.command('/pitch', handlePitch);
app.command('/shop', handleShop);

app.command('/help', async ({ command, ack, say }) => {
  await ack();
  await say({
    text: ' *Hack Tycoon Commands*\n\n' +
          '`/work` - Grind and earn HC\n' +
          '`/bal` - Check your balance\n' +
          '`/shop` - Browse items\n' +
          '`/pitch` - Pitch VCs'
  });
});


// Button handlers for deposit/withdraw
app.action('deposit_money', handleDeposit);
app.action('withdraw_money', handleWithdraw);

// Shop purchase button handlers (matches buy_coffee, buy_laptop, etc.)
app.action(/^buy_.*/, handleShopPurchase);

// Modal submission handlers
app.view('deposit_modal', handleDepositSubmit);
app.view('withdraw_modal', handleWithdrawSubmit);

(async () => {
    await app.start();
    console.log('Hack Tycoon is running!')
})();