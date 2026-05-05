import lodash from 'node-karin/lodash'
import moment from 'node-karin/moment'

/**
 * 生成指定范围内的随机整数。
 *
 * @param min - 最小值。
 * @param max - 最大值。
 * @returns 随机整数。
 */
export const random = (min: number, max: number) => lodash.random(min, max)

/**
 * 等待指定毫秒数。
 *
 * @param ms - 等待时间，单位毫秒。
 * @returns 等待完成的 Promise。
 */
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * 格式化当前时间。
 *
 * @param format - moment 时间格式。
 * @returns 格式化后的当前时间字符串。
 */
export const time = (format = 'YYYY-MM-DD HH:mm:ss') => moment().format(format)
