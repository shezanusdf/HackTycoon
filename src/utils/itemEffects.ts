export const ITEM_EFFECTS = {
    coffee: {cooldownReduction: 1},
    laptop: {earningsMultiplier: 1.15},
    chair: {rarityUpgradeChance: 0.05},
    monitor: {earningsMultiplier: 1.10},
    desk: {StreakBonusMultiplier: 1.25},
    headphones: {pitchWinRateBoost: 0.05},
    keyboard: {flatBonus: 50}
} as const;

export function calculateCooldown(ownedItems: string[]): number {
    const baseCooldown = 5;
    const hasCoffee = ownedItems.includes('coffee');
    return hasCoffee ? baseCooldown - 1 : baseCooldown;
}

export function maybeUpgradeRarity(currentRarity: string,ownedItems: string[]): string {
    if (!ownedItems.includes('chair')) return currentRarity;

    const roll = Math.random()
    if (roll > 0.05) return currentRarity;

    const rarityTiers = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
    const currentIndex = rarityTiers.indexOf(currentRarity);

    if (currentIndex === -1 || currentIndex === rarityTiers.length - 1 ) {
        return currentRarity;
    }

    return rarityTiers[currentIndex + 1];
}

export function calculateWorkEarnings(
    baseAmount: number,
    streakBonus: number,
    ownedItems: string[],
): { finalAmount: number; breakdown: { base: number; multiplier: number; streak:number; flat: number}} {
    let multiplier = 1.0
    if (ownedItems.includes('laptop')) multiplier *= 1.15;
    if (ownedItems.includes('monitor')) multiplier *= 1.10;

    const multipliedBase = Math.floor(baseAmount * multiplier);

    let finalStreak = streakBonus;
    if (ownedItems.includes('desk') && streakBonus>0) {
        finalStreak = Math.floor(streakBonus * 1.25);
    }

    const flatBonus = ownedItems.includes('keyboard') ? 50 : 0;
    const finalAmount = multipliedBase + finalStreak + flatBonus;

    return {
        finalAmount,
        breakdown : {
            base: multipliedBase,
            multiplier: multiplier,
            streak: finalStreak,
            flat: flatBonus
        }
    }
}