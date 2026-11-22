import { readFileSync } from 'node:fs';
import type { Lesson } from './types.js';

export const lesson = JSON.parse(readFileSync(new URL('../data/lesson.json', import.meta.url), 'utf8')) as Lesson;
export const lessons = [lesson];

export function lessonByNumber(number: number): Lesson {
  if (number !== lesson.number) throw new Error('This application serves Lesson 97.');
  return lesson;
}
