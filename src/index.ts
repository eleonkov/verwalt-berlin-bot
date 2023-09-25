import { Telegraf } from 'telegraf'
import schedule from 'node-schedule'
import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'

import { sleep } from './utils'
import { format } from 'date-fns'

puppeteer.use(StealthPlugin())

const JOBS: Record<string, schedule.Job> = {}

const bot = new Telegraf(process.env.BOT_TOKEN as string)

bot.command('start', async (ctx) => {
  const chatReferenceId = ctx.message.chat.id

  JOBS[chatReferenceId]?.cancel()

  JOBS[chatReferenceId] = schedule.scheduleJob('*/36 * * * *', async () => {
    const date = format(new Date(), 'dd MMM yyyy, HH:mm')

    try {
      const browser = await puppeteer.launch({
        headless: 'new',
      })

      const page = await browser.newPage()

      // Home page
      await page.goto('https://otv.verwalt-berlin.de/ams/TerminBuchen?lang=en', {
        waitUntil: 'networkidle0',
      })

      // Click book appointment button
      await page.click('.slide-content a.button.arrow-right')
      await page.waitForNavigation()
      await sleep(5000)

      // Click terms & conditions checkbox + next button
      await page.click('.label-right.required')
      await page.click('.ui-button-text.ui-c')
      await page.waitForNavigation()
      await sleep(5000)

      // Country
      const select1 = await page.$('[name="sel_staat"]')
      await select1?.select('169') // Belarus
      await sleep(3000)

      // How many people apply
      const select2 = await page.$('[name="personenAnzahl_normal"]')
      await select2?.select('1') // One person
      await sleep(3000)

      // Live in Berlin?
      const select3 = await page.$('[name="lebnBrMitFmly"]')
      await select3?.select('2') // No
      await sleep(3000)

      // Apply for a residence title
      await page.click('input[value="169-0-1"] + label')
      await sleep(3000)

      // Economic activity
      await page.click('input[value="169-0-1-1"] + label')
      await sleep(3000)

      // EU Blue Card / Blaue Karte EU (sect. 18b para. 2)
      await page.click('input[value="169-0-1-1-324659"] + label')
      await sleep(5000)

      // Click next button
      await page.click('.ui-button-text.ui-c')
      await page.waitForNavigation()
      await sleep(5000)

      const hasAvailableDates = await page.evaluate(async () => {
        const messagesBox = document.getElementById('messagesBox')

        return !messagesBox?.textContent?.trim()?.includes('no dates available for the selected service')
      })

      if (hasAvailableDates) {
        const screenshot = await page.screenshot()

        await ctx.replyWithPhoto({ source: screenshot })
      } else {
        console.log(`${date}: No dates available for the selected service.`)
      }

      browser.close()
    } catch (error) {
      console.log(`${date}: Something went wrong.`)
    }
  })

  await ctx.telegram.sendMessage(chatReferenceId, `Bot started working..`)
})

bot.command('stop', async (ctx) => {
  JOBS[ctx.message.chat.id]?.cancel()
})

bot.launch()

process.once('SIGINT', () => {
  bot.stop('SIGINT')
  schedule.gracefulShutdown().then(() => process.exit(0))
})

process.once('SIGTERM', () => {
  bot.stop('SIGTERM')
  schedule.gracefulShutdown().then(() => process.exit(0))
})
