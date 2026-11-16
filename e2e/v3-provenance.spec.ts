import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

for (const protocol of [
  'left-front-right-back-up-down/v3',
  'right-back-left-front-up-down/v3',
])
  for (const kind of ['all-retakes', 'all-missing'])
    test(`v3 ${kind} ${protocol} stays uncertain through raw export and reimport`, async ({
      page,
    }) => {
      const files = unzipSync(
        readFileSync('test/fixtures/synthetic-4x4-medium.zip'),
      )
      const key = Object.keys(files).find((key) => key.endsWith('meta.json'))!
      const meta = JSON.parse(strFromU8(files[key]))
      meta.capture.protocol = protocol
      delete meta.capture.assembledURFDLB
      delete meta.capture.faceRecovery
      for (const [step, slot] of ['u', 'r', 'f', 'd', 'l', 'b'].entries()) {
        if (kind === 'all-retakes')
          meta.faces[slot].captureGuide = {
            step,
            protocol: 'retake/v1',
            mirrored: protocol.startsWith('right-'),
            displayedArrow: null,
          }
        else delete meta.faces[slot].captureGuide
      }
      files[key] = strToU8(JSON.stringify(meta))
      const bytes = Buffer.from(zipSync(files))
      const upload = async (buffer: Buffer) => {
        await page.goto('/')
        await page
          .locator('.capture-alternatives input[type="file"]')
          .setInputFiles({
            name: 'uncertain-v3.zip',
            mimeType: 'application/zip',
            buffer,
          })
        await expect(
          page.getByRole('heading', { name: 'Match your cube', exact: true }),
        ).toBeVisible()
        await expect(page.locator('.spatial-candidate')).toHaveCount(0)
        await expect(
          page.getByRole('button', {
            name: 'Yes, this is my cube',
            exact: true,
          }),
        ).toHaveCount(0)
        await expect(
          page.getByRole('button', { name: 'Use this cube', exact: true }),
        ).toHaveCount(0)
        await expect(
          page.getByRole('button', { name: 'Check a face', exact: true }),
        ).toBeVisible()
      }
      await upload(bytes)
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      await page
        .locator('.capture-card')
        .getByRole('button', { name: 'Save capture', exact: true })
        .click()
      const download = page.waitForEvent('download')
      await page
        .getByRole('dialog', { name: 'Save as test fixture', exact: true })
        .getByRole('button', { name: 'Download zip', exact: true })
        .click()
      const path = await (await download).path()
      if (!path) throw new Error('Missing capture download')
      const raw = readFileSync(path)
      const exported = unzipSync(raw)
      const exportedMeta = JSON.parse(
        strFromU8(
          exported[
            Object.keys(exported).find((key) => key.endsWith('meta.json'))!
          ],
        ),
      )
      expect(exportedMeta.capture.protocol).toBe(protocol)
      expect(exportedMeta.capture.assembledURFDLB).toBeNull()
      expect(exportedMeta.capture.faceRecovery).toBeNull()
      expect(exportedMeta.capture.assemblyValidation).toEqual({
        status: 'not-checked',
      })
      expect(exportedMeta.colorsURFDLB).toBe(meta.colorsURFDLB)
      expect(exportedMeta.detectedURFDLB).toBe(meta.detectedURFDLB)
      for (const slot of ['u', 'r', 'f', 'd', 'l', 'b']) {
        expect(exportedMeta.faces[slot].captureGuide).toEqual(
          meta.faces[slot].captureGuide,
        )
        const photo = `face-${slot}.jpg`
        const before =
          files[Object.keys(files).find((key) => key.endsWith(photo))!]
        const after =
          exported[Object.keys(exported).find((key) => key.endsWith(photo))!]
        expect(Buffer.from(after).equals(Buffer.from(before))).toBe(true)
      }
      await upload(raw)
    })
