import { describe, it, expect } from 'vitest';
import {
  simplifyPoints,
  computePathLength,
  calculateStepDurationMs,
  assignPathsToSteps,
  createShapePath,
  generateGuideGeometry,
} from './paths';
import type { LessonPart, StepPath } from '@/types';

describe('Geometry & Path Processing Unit Tests', () => {
  describe('simplifyPoints (Ramer-Douglas-Peucker)', () => {
    it('preserves start and end points of a line', () => {
      const line = [
        { x: 0, y: 0 },
        { x: 10, y: 0.1 },
        { x: 20, y: 0 },
      ];
      const simplified = simplifyPoints(line, 1.0);
      expect(simplified.length).toBe(2);
      expect(simplified[0]).toEqual({ x: 0, y: 0 });
      expect(simplified[1]).toEqual({ x: 20, y: 0 });
    });

    it('keeps significant corner vertices above tolerance', () => {
      const corner = [
        { x: 0, y: 0 },
        { x: 50, y: 100 }, // Peak corner
        { x: 100, y: 0 },
      ];
      const simplified = simplifyPoints(corner, 2.0);
      expect(simplified.length).toBe(3);
      expect(simplified[1]).toEqual({ x: 50, y: 100 });
    });
  });

  describe('computePathLength', () => {
    it('accurately computes straight line length', () => {
      const d = 'M 0 0 L 100 0';
      const len = computePathLength(d);
      expect(len).toBe(100);
    });

    it('computes perimeter of a rectangle', () => {
      const rect = 'M 0 0 L 100 0 L 100 50 L 0 50 Z';
      const len = computePathLength(rect);
      expect(len).toBeGreaterThanOrEqual(250);
    });
  });

  describe('calculateStepDurationMs (Duration math)', () => {
    it('clamps minimum duration to 4000ms', () => {
      const emptyPaths: StepPath[] = [];
      const duration = calculateStepDurationMs(emptyPaths);
      expect(duration).toBe(4000);
    });

    it('clamps maximum duration to 25000ms', () => {
      const hugePaths: StepPath[] = [
        { d: 'M 0 0 L 5000 0', kind: 'contour', length: 50000, order: 1, stroke_width: 2, opacity: 1 },
      ];
      const duration = calculateStepDurationMs(hugePaths);
      expect(duration).toBe(25000);
    });

    it('calculates proportional duration within range', () => {
      const paths: StepPath[] = [
        { d: 'M 0 0 L 200 0', kind: 'contour', length: 600, order: 1, stroke_width: 2, opacity: 1 },
      ];
      const duration = calculateStepDurationMs(paths);
      expect(duration).toBeGreaterThan(4000);
      expect(duration).toBeLessThan(25000);
    });
  });

  describe('createShapePath and generateGuideGeometry', () => {
    it('creates circle and rect SVG paths', () => {
      const circlePath = createShapePath(10, 10, 50, 50, 'circle');
      expect(circlePath).toContain('M');
      expect(circlePath).toContain('A');

      const rectPath = createShapePath(10, 10, 50, 50, 'rect');
      expect(rectPath).toContain('M 10 10 L 60 10');
    });

    it('generates centerlines and rule of thirds guidelines', () => {
      const guides = generateGuideGeometry(900, 600, []);
      expect(guides.length).toBeGreaterThanOrEqual(6);
      expect(guides[0].kind).toBe('guide');
    });
  });

  describe('assignPathsToSteps', () => {
    const mockParts: LessonPart[] = [
      {
        id: 'p1',
        name: 'Head',
        kind: 'main-shape',
        box_2d: [100, 100, 400, 400], // [ymin, xmin, ymax, xmax]
        approx_shape: 'circle',
        draw_order: 1,
        tips: [],
      },
      {
        id: 'p2',
        name: 'Body',
        kind: 'secondary',
        box_2d: [450, 200, 900, 700],
        approx_shape: 'ellipse',
        draw_order: 2,
        tips: [],
      },
    ];

    const mockSteps = [
      { part_ids: ['p1'] },
      { part_ids: ['p2'] },
    ];

    it('assigns head path to step 0 and body path to step 1 based on spatial bounds', () => {
      const inputPaths = [
        { d: 'M 250 250 L 300 250', kind: 'contour' as const, stroke_width: 2, opacity: 1 }, // Inside head (step 0)
        { d: 'M 400 600 L 450 600', kind: 'contour' as const, stroke_width: 2, opacity: 1 }, // Inside body (step 1)
      ];

      const assigned = assignPathsToSteps(inputPaths, mockSteps, mockParts, 1000, 1000);
      expect(assigned[0].length).toBe(1);
      expect(assigned[1].length).toBe(1);
      expect(assigned[0][0].order).toBe(1);
    });

    it('sorts paths within each step from longest to shortest', () => {
      const inputPaths = [
        { d: 'M 200 200 L 250 200', kind: 'contour' as const, stroke_width: 2, opacity: 1 }, // Len 50
        { d: 'M 200 250 L 350 250', kind: 'contour' as const, stroke_width: 2, opacity: 1 }, // Len 150
      ];

      const assigned = assignPathsToSteps(inputPaths, mockSteps, mockParts, 1000, 1000);
      expect(assigned[0].length).toBe(2);
      expect(assigned[0][0].length).toBeGreaterThan(assigned[0][1].length);
      expect(assigned[0][0].order).toBe(1);
      expect(assigned[0][1].order).toBe(2);
    });
  });
});
