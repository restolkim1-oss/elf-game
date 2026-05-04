import { CARD_LIBRARY, DEFAULT_DECK, TRAINING_ENEMY } from "../data/cardBattleData";
import { CardBattleEngine } from "./CardBattleEngine";

export function runExampleBattleSimulation() {
  const deck = DEFAULT_DECK.map((id) => CARD_LIBRARY[id]);
  const engine = new CardBattleEngine(deck, TRAINING_ENEMY, {
    maxDeckSize: 10,
    startingHandSize: 5,
    drawPerTurn: 2,
    maxCostPerTurn: 5,
  });

  const snapshots = [engine.startBattle()];
  while (!["won", "lost"].includes(snapshots[snapshots.length - 1].phase) && snapshots.length < 12) {
    const current = engine.snapshot();
    for (const card of current.hand) {
      if (card.definition.cost <= engine.snapshot().costRemaining) {
        engine.selectCard(card.instanceId);
      }
    }
    snapshots.push(engine.resolvePlayerTurn());
  }

  return snapshots.map((snapshot) => ({
    turn: snapshot.turn,
    phase: snapshot.phase,
    playerHp: snapshot.player.hp,
    enemyHp: snapshot.enemy.hp,
    hand: snapshot.hand.map((card) => card.definition.name),
    combos: snapshot.activeCombos,
    synergies: snapshot.activeSynergies,
    visualEvents: snapshot.visualEvents.map((event) => ({
      at: event.at,
      type: event.type,
      sourceId: event.sourceId,
      targetId: event.targetId,
      value: event.value,
    })),
    lastLog: snapshot.log[snapshot.log.length - 1]?.text ?? "",
  }));
}
