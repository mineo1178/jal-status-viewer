const test = require('node:test');
const assert = require('node:assert/strict');
const utils = require('../data-utils.js');

test('parseDate accepts YYYY-MM-DD, YYYY/MM/DD, and Excel serial formats', () => {
    assert.equal(utils.parseDate(46021), '2025-12-30');
    assert.equal(utils.parseDate('2026-09-05'), '2026-09-05');
    assert.equal(utils.parseDate('2026/9/5'), '2026-09-05');
});

test('parseDate rejects invalid and unsupported date formats instead of guessing', () => {
    assert.equal(utils.parseDate('2026-13-05'), '');
    assert.equal(utils.parseDate('2026-02-30'), '');
    assert.equal(utils.parseDate('2026.09.05'), '');
    assert.equal(utils.parseDate('not-a-date'), '');
});

test('todayJst remains correct at 23:59 JST', () => {
    assert.equal(utils.todayJst(new Date('2026-09-05T14:59:00Z')), '2026-09-05');
});

test('todayJst changes at 00:00 JST', () => {
    assert.equal(utils.todayJst(new Date('2026-09-05T15:00:00Z')), '2026-09-06');
});

test('todayJst remains on the new date at 00:01 JST', () => {
    assert.equal(utils.todayJst(new Date('2026-09-05T15:01:00Z')), '2026-09-06');
});

test('standard completed status remains standard', () => {
    assert.deepEqual(utils.normalizeStatus('済'), { value: '済', isCompleted: true, isStandard: true, warning: '' });
});

for (const status of ['済み', '搭乗済', '完了']) {
    test(`${status} is normalized to completed with an audit warning`, () => {
        const normalized = utils.normalizeStatus(status);
        assert.equal(normalized.value, '済');
        assert.equal(normalized.isCompleted, true);
        assert.equal(normalized.warning.includes('非標準値'), true);
    });
}

test('planned and unknown statuses are not treated as completed', () => {
    assert.equal(utils.normalizeStatus('予定').isCompleted, false);
    assert.equal(utils.normalizeStatus('取消').isStandard, false);
    assert.equal(utils.normalizeStatus('取消').warning.includes('想定外'), true);
});

test('required column validation distinguishes missing schema from zero-valued data', () => {
    const errors = utils.getRequiredColumnErrors(['日付', '内容', '有効マイル'], [
        { label: '日付', aliases: ['日付'] },
        { label: '獲得マイル', aliases: ['獲得マイル', '獲得'] },
        { label: '有効マイル', aliases: ['有効マイル', '残高'] }
    ]);
    assert.deepEqual(errors, ['必須列「獲得マイル」が見つかりません']);
});

test('required sheet validation distinguishes present and missing sheets', () => {
    const required = [{ keyword: 'lsp', label: 'LSP' }, { keyword: 'マイル', label: 'マイル' }, { keyword: '計画', label: '計画' }];
    assert.deepEqual(utils.getRequiredSheetErrors(['LSP履歴', 'マイル管理', '搭乗計画'], required), []);
    assert.deepEqual(utils.getRequiredSheetErrors(['LSP履歴', '搭乗計画'], required), ['必須シート「マイル」が見つかりません']);
});

test('strict number parsing preserves invalid input as invalid instead of silently using zero', () => {
    assert.deepEqual(utils.parseNumberStrict('1,234'), { valid: true, value: 1234 });
    assert.deepEqual(utils.parseNumberStrict('１２．５'), { valid: true, value: 12.5 });
    assert.deepEqual(utils.parseNumberStrict('not-a-number'), { valid: false, value: 0 });
});
