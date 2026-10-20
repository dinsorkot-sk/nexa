import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import NxAccordion from '../src/components/NxAccordion.vue';
import NxModal from '../src/components/NxModal.vue';
import NxPopover from '../src/components/NxPopover.vue';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string) => readFileSync(join(root, file), 'utf8');

const motion = read('src/styles/motion.css');
const tokens = read('src/styles/tokens.css');
const stylesheet = read('src/styles/index.css');

/** Every .vue/.ts/.css under `dir`, without build output or installed packages. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'dist' || name === 'dist-check' || name === 'node_modules') return [];
    return statSync(path).isDirectory() ? sources(path) : [path];
  }).filter((path) => /\.(vue|ts|css)$/.test(path));
}

const scanned = [...sources(join(root, 'src')), ...sources(join(root, 'playground'))];

/** The animations, durations and easings motion.css actually declares. */
const declared = {
  animations: [...motion.matchAll(/--animate-(ui-[a-z-]+):\s*([a-z-]+)/g)].map((match) => ({ name: match[1], keyframe: match[2] })),
  keyframes: [...motion.matchAll(/@keyframes\s+(ui-[a-z-]+)/g)].map((match) => match[1]),
  durations: [...motion.matchAll(/@utility\s+(duration-ui[a-z-]*)/g)].map((match) => match[1]),
  easings: [...motion.matchAll(/--ease-(ui-[a-z-]+):/g)].map((match) => match[1]),
};

describe('motion system', () => {
  it('is imported by the single stylesheet the app loads', () => {
    expect(stylesheet).toContain("@import './motion.css'");
  });

  it('declares a keyframe for every animation it names', () => {
    expect(declared.animations.length).toBeGreaterThan(10);
    for (const animation of declared.animations) {
      expect(declared.keyframes, animation.name).toContain(animation.keyframe);
    }
  });

  it('keeps the enter and exit animation of a surface under different keyframe names', () => {
    // Reka UI only waits for the exit animation when the computed animation-name changed, so an enter and an
    // exit that share a keyframe would unmount the panel before it could animate out.
    const paired = declared.animations
      .filter((animation) => /-in(-(left|right))?$/.test(animation.name))
      .map((enter) => ({ enter, exit: declared.animations.find((animation) => animation.name === enter.name.replace(/-in(-(left|right))?$/, '-out$1')) }))
      .filter(({ exit }) => exit !== undefined);
    expect(paired.length).toBeGreaterThan(3);
    for (const { enter, exit } of paired) {
      expect(exit?.keyframe, `${enter.name} must not reuse its enter keyframe`).not.toBe(enter.keyframe);
    }
  });

  it('animates overlay surfaces in and out through their data-state', () => {
    const overlays = [
      'NxModal.vue', 'NxSlideover.vue', 'NxPopover.vue', 'NxTooltip.vue', 'NxCommandPalette.vue',
      'NxCombobox.vue', 'NxDatePicker.vue', 'NxAccordion.vue',
    ];
    for (const file of overlays) {
      const source = read(join('src/components', file));
      expect(source, file).toMatch(/data-\[state=(closed|open)\]:animate-ui-/);
    }
  });

  it('only uses animations, durations and easings that motion.css declares', () => {
    for (const path of scanned) {
      const text = readFileSync(path, 'utf8');
      const name = path.slice(root.length + 1);
      for (const [usage, allowed] of [
        [/animate-ui-[a-z-]+/g, declared.animations.map((animation) => `animate-${animation.name}`)],
        [/duration-ui[a-z-]*/g, declared.durations],
        [/ease-ui-[a-z-]+/g, declared.easings.map((easing) => `ease-${easing}`)],
      ] as Array<[RegExp, string[]]>) {
        for (const match of text.match(usage) ?? []) expect(allowed, `${name} uses ${match}`).toContain(match);
      }
    }
  });

  it('times everything from the tokens, not from the built-in scale', () => {
    for (const path of scanned) {
      const text = readFileSync(path, 'utf8');
      const name = path.slice(root.length + 1);
      // `duration-150` and `duration-[200ms]` would silently ignore prefers-reduced-motion, and so would a
      // built-in easing: both have to come from the tokens.
      expect(text.match(/\bduration-(\d|\[)/g) ?? [], name).toEqual([]);
      expect(text.match(/(?<![-\w])ease-(linear|in|out|in-out|initial|inherit)\b/g) ?? [], name).toEqual([]);
      // The loading placeholders are the only built-in animations allowed; the reduced-motion block covers them.
      const builtIn = text.match(/\banimate-(pulse|spin|bounce|ping)\b/g) ?? [];
      for (const animation of builtIn) expect(['animate-spin', 'animate-pulse'], `${name} uses ${animation}`).toContain(animation);
    }
  });

  it('turns the whole system off under prefers-reduced-motion', () => {
    const reduce = motion.slice(motion.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduce).toContain('--ui-motion-fast: 0ms');
    expect(reduce).toContain('--ui-motion-base: 0ms');
    expect(reduce).toContain('--ui-motion-slow: 0ms');
    expect(reduce).toContain('animation-duration: 0.01ms !important');
    expect(reduce).toContain('transition-duration: 0.01ms !important');
  });

  it('defines the durations and easings the keyframes read', () => {
    for (const token of ['--ui-motion-fast', '--ui-motion-base', '--ui-motion-slow', '--ui-ease-out', '--ui-ease-in-out', '--ui-ease-spring']) {
      expect(tokens, token).toContain(`${token}:`);
    }
  });

  it('lands the animated surface on the element Reka marks with its state', async () => {
    // A `data-[state=open]:animate-…` class only ever runs if the element it sits on is the one Reka toggles,
    // so the classes are checked against the rendered overlay rather than only against the source.
    const modal = mount(NxModal, { props: { open: true, title: 'Delete vehicle?', description: 'Cannot be undone' }, attachTo: document.body });
    await flushPromises();
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('data-state')).toBe('open');
    expect(dialog?.className).toContain('data-[state=open]:animate-ui-pop-in');
    expect(document.querySelector('.bg-ui-overlay')?.className).toContain('data-[state=open]:animate-ui-fade-in');
    modal.unmount();
    await nextTick();

    const popover = mount(NxPopover, { props: { open: true }, slots: { trigger: '<button>Help</button>' }, attachTo: document.body });
    await flushPromises();
    const panel = document.querySelector('[data-reka-popper-content-wrapper] > div');
    expect(panel?.getAttribute('data-state')).toBe('open');
    expect(panel?.className).toContain('data-[state=closed]:animate-ui-pop-out');
    popover.unmount();
    await nextTick();

    const accordion = mount(NxAccordion, { props: { items: [{ value: 'details', title: 'Details', content: 'Record information' }] } });
    await accordion.find('button').trigger('click');
    const region = accordion.find('[role="region"]');
    expect(region.attributes('data-state')).toBe('open');
    expect(region.classes()).toContain('data-[state=open]:animate-ui-collapse-down');
  });
});
