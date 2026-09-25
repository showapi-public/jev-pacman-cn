"use client";

/**
 * Pac-Man's run: the machine (`AppShell`) plus the three things that are only
 * true of this game — the board, its six registers, and its help text.
 *
 * It owns nothing itself. The run comes from `useGameSession`; the stage from the
 * shared `GameCanvas`; the frame from `AppShell`; the control bar from
 * `ControlBar`, which takes this game's copy out of its metadata. What is left
 * here is the assembly, and `components/games/pages.tsx` is the only place that
 * knows this component exists.
 */

import { ArrowCounterClockwise, Info, Pause, Play } from "@phosphor-icons/react";

import { DecisionConsole } from "@/components/console/DecisionConsole";
import type { ConsoleInput } from "@/components/console/input";
import { GameCanvas } from "@/components/games/GameCanvas";
import { PacmanHelp } from "@/components/games/pacman/PacmanHelp";
import { PacmanMeters } from "@/components/games/pacman/PacmanMeters";
import { AppShell } from "@/components/shell/AppShell";
import { ControlBar } from "@/components/shell/ControlBar";
import { GameSwitcher } from "@/components/shell/GameSwitcher";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Panel, PanelActions, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { computeMetrics } from "@/lib/agent/telemetry";
import { PACMAN } from "@/lib/games/pacman/index";
import { GAME_STATUS_TONE, MODE_LABELS, STATUS_LABELS, formatMs } from "@/lib/ui";
import { useGameSession } from "@/lib/use-game-session";

export function PacmanPage() {
  const session = useGameSession(PACMAN);
  const { state, controller } = session;

  const running = state.status === "PLAYING";
  const playLabel = running ? "暂停" : state.status === "PAUSED" ? "继续" : "开始";
  const PlayIcon = running ? Pause : Play;

  /*
   * The right column's whole input. Nothing in it is Pac-Man-shaped — the four
   * things that are come from the game's own meta and vocab, which is exactly
   * the seam that lets a second game reuse every panel below.
   */
  const consoleInput: ConsoleInput = {
    status: state.status,
    metrics: computeMetrics(controller.telemetry),
    records: controller.telemetry,
    controller,
    // 预算由游戏声明，所以从游戏定义上取 —— 与右栏、控制条读的是同一个数。
    budgetMs: PACMAN.agent.budgetMs,
    speed: session.speed,
    playTimeMs: state.playTimeMs,
    events: session.events,
    vocab: PACMAN.vocab,
    actor: PACMAN.meta.actor,
    place: PACMAN.meta.place,
    steerable: session.mode === "MANUAL",
    debug: session.debug,
    onSteer: session.steer,
  };

  const status = (
    <>
      {session.neon ? (
        <Chip tone="busy" dot role="status">
          霓虹模式
        </Chip>
      ) : null}
      <Chip tone={GAME_STATUS_TONE[state.status]} dot role="status">
        {STATUS_LABELS[state.status]}
      </Chip>
      <Chip>
        种子 <span className="num">{session.seed}</span>
      </Chip>
      <Chip>
        时长 <span className="num">{formatMs(state.playTimeMs)}</span>
      </Chip>
      <Button
        variant="primary"
        onClick={session.startPause}
        disabled={state.status === "GAME_OVER"}
        className="gap-1.5"
        title={running ? "暂停游戏" : state.status === "PAUSED" ? "继续游戏" : "让当前玩家开始游玩"}
      >
        <PlayIcon aria-hidden="true" weight="fill" className="size-3.5" />
        {playLabel}
      </Button>
      {state.status === "GAME_OVER" ? (
        <Button
          onClick={() => session.restart(session.seed, session.mode)}
          className="gap-1.5"
          title="用当前种子和玩家重新开一局"
        >
          <ArrowCounterClockwise aria-hidden="true" weight="bold" className="size-3.5" />
          重开
        </Button>
      ) : null}
    </>
  );

  return (
    <AppShell
      selfColor={PACMAN.meta.selfColor}
      glyph={PACMAN.meta.glyph}
      nav={<GameSwitcher current={PACMAN.meta.id} />}
      title={`Jev 玩${PACMAN.meta.name}`}
      status={status}
    >
      <div className="flex min-h-0 min-w-0 flex-col gap-4">
        <Panel id="stage" aria-labelledby="maze-heading" className="min-h-0 flex-1">
          <PanelHeader>
            <PanelTitle id="maze-heading">迷宫</PanelTitle>
            <PanelActions>
              <Chip tone={session.mode !== "MANUAL" && running ? "live" : "neutral"} dot>
                {session.mode === "MANUAL" ? "方向键驾驶" : `玩家 ${MODE_LABELS[session.mode]}`}
              </Chip>
              <PacmanHelp>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="玩法与颜色说明"
                  title="决策是怎么产生的，以及迷宫里的颜色各自代表什么"
                >
                  <Info aria-hidden="true" weight="bold" className="size-3.5" />
                </Button>
              </PacmanHelp>
            </PanelActions>
          </PanelHeader>

          <GameCanvas
            game={PACMAN}
            stateRef={session.stateRef}
            controllerRef={session.controllerRef}
            mode={session.mode}
            speed={session.speed}
            debug={session.debug}
            neon={session.neon}
            crt={session.crtOn}
            sound={session.sound}
            attract={state.status === "READY"}
            attractText="投入硬币 —— 按开始"
            ariaLabel="吃豆人迷宫。实时得分、豆子与幽灵状态见迷宫下方的参数栏。"
            onSnapshot={session.publish}
            onEvents={session.onEvents}
          />

          <PacmanMeters state={state} controller={controller} />
        </Panel>

        <Panel aria-label="操作面板">
          <ControlBar
            meta={PACMAN.meta}
            budgetMs={PACMAN.agent.budgetMs}
            mode={session.mode}
            speed={session.speed}
            seed={session.seed}
            debug={session.debug}
            soundOn={session.soundOn}
            crtOn={session.crtOn}
            status={state.status}
            catalogue={session.catalogue}
            modelId={session.modelId}
            onModel={session.setModel}
            onMode={session.setMode}
            onSpeed={session.setSpeed}
            onSeed={session.setSeed}
            onToggleDebug={session.toggleDebug}
            onToggleSound={session.toggleSound}
            onToggleCrt={session.toggleCrt}
            onRestart={() => session.restart(session.seed, session.mode)}
            onExport={session.exportRun}
          />
        </Panel>
      </div>

      <DecisionConsole input={consoleInput} />
    </AppShell>
  );
}
