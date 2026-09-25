"use client";

/**
 * 蛇这一局：机台（`AppShell`）加上只对它成立的三样东西 —— 盘面、六个读数、帮助文案。
 *
 * 它自己什么都不拥有。这一局来自 `useGameSession`，舞台来自共用的 `GameCanvas`，
 * 外框来自 `AppShell`，控制条来自 `ControlBar`（它从元数据里取这款游戏的文案）。
 * 留在这里的就是装配，而 `components/games/pages.tsx` 是唯一知道这个组件存在的地方。
 */

import { ArrowCounterClockwise, Info, Pause, Play } from "@phosphor-icons/react";

import { DecisionConsole } from "@/components/console/DecisionConsole";
import type { ConsoleInput } from "@/components/console/input";
import { GameCanvas } from "@/components/games/GameCanvas";
import { SnakeHelp } from "@/components/games/snake/SnakeHelp";
import { SnakeMeters } from "@/components/games/snake/SnakeMeters";
import { AppShell } from "@/components/shell/AppShell";
import { ControlBar } from "@/components/shell/ControlBar";
import { GameSwitcher } from "@/components/shell/GameSwitcher";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Panel, PanelActions, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { computeMetrics } from "@/lib/agent/telemetry";
import { SNAKE } from "@/lib/games/snake/index";
import { GAME_STATUS_TONE, MODE_LABELS, STATUS_LABELS, formatMs } from "@/lib/ui";
import { useGameSession } from "@/lib/use-game-session";

export function SnakePage() {
  const session = useGameSession(SNAKE);
  const { state, controller } = session;

  const running = state.status === "PLAYING";
  const playLabel = running ? "暂停" : state.status === "PAUSED" ? "继续" : "开始";
  const PlayIcon = running ? Pause : Play;

  /*
   * 右栏的全部输入。里面没有一件是蛇的形状 —— 那四件（动作词表、主体名词、地点名词、
   * 预算）都来自这款游戏自己的 meta / vocab，这正是下面每一个面板都能被第二款游戏
   * 原样复用的那道缝。
   */
  const consoleInput: ConsoleInput = {
    status: state.status,
    metrics: computeMetrics(controller.telemetry),
    records: controller.telemetry,
    controller,
    // 预算是游戏声明的，不是「吃豆人的 500 ms」——蛇声明了同一个数，跨游戏延迟才可直接比较。
    budgetMs: SNAKE.agent.budgetMs,
    speed: session.speed,
    playTimeMs: state.playTimeMs,
    events: session.events,
    vocab: SNAKE.vocab,
    actor: SNAKE.meta.actor,
    place: SNAKE.meta.place,
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
      selfColor={SNAKE.meta.selfColor}
      glyph={SNAKE.meta.glyph}
      nav={<GameSwitcher current={SNAKE.meta.id} />}
      title={`Jev 玩${SNAKE.meta.name}`}
      status={status}
    >
      <div className="flex min-h-0 min-w-0 flex-col gap-4">
        <Panel id="stage" aria-labelledby="board-heading" className="min-h-0 flex-1">
          <PanelHeader>
            <PanelTitle id="board-heading">盘面</PanelTitle>
            <PanelActions>
              <Chip tone={session.mode !== "MANUAL" && running ? "live" : "neutral"} dot>
                {session.mode === "MANUAL" ? "方向键驾驶" : `玩家 ${MODE_LABELS[session.mode]}`}
              </Chip>
              <SnakeHelp>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="玩法与颜色说明"
                  title="决策是怎么产生的，以及盘面上的颜色各自代表什么"
                >
                  <Info aria-hidden="true" weight="bold" className="size-3.5" />
                </Button>
              </SnakeHelp>
            </PanelActions>
          </PanelHeader>

          <GameCanvas
            game={SNAKE}
            stateRef={session.stateRef}
            controllerRef={session.controllerRef}
            mode={session.mode}
            speed={session.speed}
            debug={session.debug}
            neon={session.neon}
            crt={session.crtOn}
            sound={session.sound}
            attract={state.status === "READY"}
            attractText="按开始 —— 第一步要有人给方向"
            ariaLabel="贪吃蛇盘面。实时长度、食物与已走步数见盘面下方的参数栏。"
            onSnapshot={session.publish}
            onEvents={session.onEvents}
          />

          <SnakeMeters state={state} />
        </Panel>

        <Panel aria-label="操作面板">
          <ControlBar
            meta={SNAKE.meta}
            budgetMs={SNAKE.agent.budgetMs}
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
