import React, { useState, useEffect, useRef } from 'react';
import { Stage, Layer, Circle, Rect } from 'react-konva';
import Konva from 'konva';
import { Layer as LayerType } from 'konva/lib/Layer';

// --- TYPE DEFINITIONS ---
interface EnemyData { type: string; count: number; }
interface WaveData { wave: number; enemies: EnemyData[]; }
interface Enemy { id: number; x: number; y: number; hp: number; type: string; radius: number; }
interface Bullet { id: number; x: number; y: number; dx: number; dy: number; radius: number; }

const ENEMY_STATS: { [key: string]: { hp: number, radius: number, speed: number } } = {
  normal: { hp: 10, radius: 15, speed: 50 },
  fast: { hp: 5, radius: 10, speed: 80 },
  tank: { hp: 50, radius: 25, speed: 30 },
};

const Game: React.FC = () => {
  // --- STATE MANAGEMENT ---
  const [coreHp, setCoreHp] = useState(100);
  const [waves, setWaves] = useState<WaveData[]>([]);
  const [currentWave, setCurrentWave] = useState(0);
  const [enemies, setEnemies] =useState<Enemy[]>([]);
  const [bullets, setBullets] = useState<Bullet[]>([]);
  const [gameState, setGameState] = useState<'playing' | 'gameover' | 'victory'>('playing');

  const stageWidth = window.innerWidth;
  const stageHeight = window.innerHeight;
  const coreX = stageWidth / 2;
  const coreY = stageHeight / 2;
  const coreRadius = 30;

  const layerRef = useRef<LayerType>(null);

  // --- INITIALIZATION ---
  useEffect(() => {
    fetch('/waves.json')
      .then((res) => res.json())
      .then((data) => setWaves(data));
  }, []);

  const spawnWave = (waveNumber: number) => {
    const waveData = waves.find(w => w.wave === waveNumber);
    if (!waveData) {
      setGameState('victory');
      return;
    }

    const newEnemies: Enemy[] = [];
    let enemyIdCounter = Date.now();

    waveData.enemies.forEach(enemyGroup => {
      const stats = ENEMY_STATS[enemyGroup.type] || ENEMY_STATS.normal;
      for (let i = 0; i < enemyGroup.count; i++) {
        const side = Math.floor(Math.random() * 4);
        let x, y;
        if (side === 0) { x = Math.random() * stageWidth; y = -stats.radius; }
        else if (side === 1) { x = stageWidth + stats.radius; y = Math.random() * stageHeight; }
        else if (side === 2) { x = Math.random() * stageWidth; y = stageHeight + stats.radius; }
        else { x = -stats.radius; y = Math.random() * stageHeight; }

        newEnemies.push({
          id: enemyIdCounter++,
          x, y,
          hp: stats.hp,
          type: enemyGroup.type,
          radius: stats.radius
        });
      }
    });
    setEnemies(newEnemies);
    setCurrentWave(waveNumber);
  };

  useEffect(() => {
    if (waves.length > 0 && currentWave === 0) {
      spawnWave(1);
    }
  }, [waves, currentWave]);

  // --- AUTO-FIRE LOGIC ---
  useEffect(() => {
    if (gameState !== 'playing') return;
    const fireInterval = setInterval(() => {
      if (enemies.length === 0) return;
      let nearestEnemy: Enemy | null = null;
      let minDistance = Infinity;
      enemies.forEach(enemy => {
        const d = Math.sqrt(Math.pow(enemy.x - coreX, 2) + Math.pow(enemy.y - coreY, 2));
        if (d < minDistance) { minDistance = d; nearestEnemy = enemy; }
      });

      if (nearestEnemy) {
        const d = Math.sqrt(Math.pow(nearestEnemy.x - coreX, 2) + Math.pow(nearestEnemy.y - coreY, 2));
        const newBullet: Bullet = { id: Date.now(), x: coreX, y: coreY, dx: (nearestEnemy.x - coreX) / d, dy: (nearestEnemy.y - coreY) / d, radius: 5 };
        setBullets(prev => [...prev, newBullet]);
      }
    }, 400);
    return () => clearInterval(fireInterval);
  }, [enemies, coreX, coreY, gameState]);

  // --- MAIN GAME LOOP ---
  useEffect(() => {
    if (!layerRef.current || gameState !== 'playing') return;
    const anim = new Konva.Animation(frame => {
      if (!frame) return;
      const delta = frame.timeDiff / 1000;
      const bulletSpeed = 350;

      let updatedEnemies = [...enemies];
      let updatedBullets = [...bullets];
      let newCoreHp = coreHp;

      // Move and check bullet-enemy collisions
      const bulletsToRemove = new Set<number>();
      const enemiesToDamage = new Map<number, number>();

      updatedBullets.forEach(bullet => {
        bullet.x += bullet.dx * bulletSpeed * delta;
        bullet.y += bullet.dy * bulletSpeed * delta;
        if (bullet.x < 0 || bullet.x > stageWidth || bullet.y < 0 || bullet.y > stageHeight) {
          bulletsToRemove.add(bullet.id);
        }

        updatedEnemies.forEach(enemy => {
          const dist = Math.sqrt(Math.pow(bullet.x - enemy.x, 2) + Math.pow(bullet.y - enemy.y, 2));
          if (dist < enemy.radius + bullet.radius) {
            bulletsToRemove.add(bullet.id);
            enemiesToDamage.set(enemy.id, (enemiesToDamage.get(enemy.id) || 0) + 10); // 10 damage per bullet
          }
        });
      });

      // Move enemies and check core collision
      const enemiesToRemove = new Set<number>();
      updatedEnemies.forEach(enemy => {
        if (enemiesToDamage.has(enemy.id)) {
          enemy.hp -= enemiesToDamage.get(enemy.id)!;
        }
        if (enemy.hp <= 0) {
          enemiesToRemove.add(enemy.id);
          return;
        }

        const distToCore = Math.sqrt(Math.pow(enemy.x - coreX, 2) + Math.pow(enemy.y - coreY, 2));
        if (distToCore < coreRadius + enemy.radius) {
          enemiesToRemove.add(enemy.id);
          newCoreHp -= 10; // 10 damage to core
          return;
        }

        const stats = ENEMY_STATS[enemy.type] || ENEMY_STATS.normal;
        const moveX = ((coreX - enemy.x) / distToCore) * stats.speed * delta;
        const moveY = ((coreY - enemy.y) / distToCore) * stats.speed * delta;
        enemy.x += moveX;
        enemy.y += moveY;
      });

      // Update states
      setBullets(prev => prev.filter(b => !bulletsToRemove.has(b.id)));
      setEnemies(prev => prev.filter(e => !enemiesToRemove.has(e.id)));
      if (newCoreHp !== coreHp) setCoreHp(newCoreHp);

      // Check game state
      if (newCoreHp <= 0) {
        setGameState('gameover');
      } else if (updatedEnemies.filter(e => !enemiesToRemove.has(e.id)).length === 0 && waves.length > 0) {
        spawnWave(currentWave + 1);
      }
    }, layerRef.current);

    anim.start();
    return () => anim.stop();
  }, [gameState, enemies, bullets, waves, currentWave, coreHp]);

  return (
    <Stage width={stageWidth} height={stageHeight}>
      <Layer ref={layerRef}>
        {/* Core */}
        <Circle x={coreX} y={coreY} radius={coreRadius} fill="lightblue" stroke="blue" strokeWidth={4} />
        {/* Enemies */}
        {enemies.map(enemy => <Rect key={enemy.id} x={enemy.x - enemy.radius} y={enemy.y - enemy.radius} width={enemy.radius*2} height={enemy.radius*2} fill={enemy.type === 'tank' ? 'purple' : enemy.type === 'fast' ? 'orange' : 'red'} />)}
        {/* Bullets */}
        {bullets.map(bullet => <Circle key={bullet.id} x={bullet.x} y={bullet.y} radius={bullet.radius} fill="yellow" />)}
      </Layer>
      {/* UI */}
      <div style={{ position: 'absolute', top: 10, left: 10, color: 'white', fontSize: 24 }}>
        <div>Core HP: {coreHp}</div>
        <div>Wave: {currentWave}</div>
      </div>
      {gameState === 'gameover' && <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'red', fontSize: 48, backgroundColor: 'rgba(0,0,0,0.5)', padding: 20 }}>GAME OVER</div>}
      {gameState === 'victory' && <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'gold', fontSize: 48, backgroundColor: 'rgba(0,0,0,0.5)', padding: 20 }}>VICTORY!</div>}
    </Stage>
  );
};

export default Game;
