import { expect, test } from 'vitest'
import * as api from '../src/index'

test('exports only the two factory functions', () => {
  expect(Object.keys(api).sort()).toEqual(['createTabInterval', 'createTabLeader'])
})
