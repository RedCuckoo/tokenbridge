const sinon = require('sinon')
const { expect } = require('chai')
const proxyquire = require('proxyquire').noPreserveCache()
const Web3Utils = require('web3-utils')
const {
  fetchGasPrice,
  processGasPriceOptions,
  gasPriceWithinLimits,
  normalizeGasPrice
} = require('../src/services/gasPrice')
const {
  DEFAULT_UPDATE_INTERVAL,
  GAS_PRICE_OPTIONS,
  ORACLE_GAS_PRICE_SPEEDS,
  GAS_PRICE_BOUNDARIES
} = require('../src/utils/constants')

describe('gasPrice', () => {
  describe('fetchGasPrice', () => {
    const oracleMockResponse = {
      fast: 17.64,
      block_time: 13.548,
      health: true,
      standard: 10.64,
      block_number: 6704240,
      instant: 51.9,
      slow: 4.4
    }
    beforeEach(() => {
      sinon.stub(console, 'error')
    })
    afterEach(() => {
      console.error.restore()
    })

    it('should fetch the gas price from the oracle by default', async () => {
      // given
      const oracleFnMock = () =>
        Promise.resolve({
          oracleGasPrice: '1',
          oracleResponse: oracleMockResponse
        })
      const bridgeContractMock = {
        methods: {
          gasPrice: {
            call: sinon.stub().returns(Promise.resolve('2'))
          }
        }
      }

      // when
      const { gasPrice, oracleGasPriceSpeeds } = await fetchGasPrice({
        bridgeContract: bridgeContractMock,
        oracleFn: oracleFnMock
      })

      // then
      expect(gasPrice).to.equal('1')
      expect(oracleGasPriceSpeeds).to.equal(oracleMockResponse)
    })
    it('should fetch the gas price from the contract if the oracle fails', async () => {
      // given
      const oracleFnMock = () => Promise.reject(new Error('oracle failed'))
      const bridgeContractMock = {
        methods: {
          gasPrice: sinon.stub().returns({
            call: sinon.stub().returns(Promise.resolve('2'))
          })
        }
      }

      // when
      const { gasPrice, oracleGasPriceSpeeds } = await fetchGasPrice({
        bridgeContract: bridgeContractMock,
        oracleFn: oracleFnMock
      })

      // then
      expect(gasPrice).to.equal('2')
      expect(oracleGasPriceSpeeds).to.equal(null)
    })
    it('should return null if both the oracle and the contract fail', async () => {
      // given
      const oracleFnMock = () => Promise.reject(new Error('oracle failed'))
      const bridgeContractMock = {
        methods: {
          gasPrice: sinon.stub().returns({
            call: sinon.stub().returns(Promise.reject(new Error('contract failed')))
          })
        }
      }

      // when
      const { gasPrice, oracleGasPriceSpeeds } = await fetchGasPrice({
        bridgeContract: bridgeContractMock,
        oracleFn: oracleFnMock
      })

      // then
      expect(gasPrice).to.equal(null)
      expect(oracleGasPriceSpeeds).to.equal(null)
    })
  })
  describe('start', () => {
    const utils = { setIntervalAndRun: sinon.spy() }
    beforeEach(() => {
      utils.setIntervalAndRun.resetHistory()
    })
    it('should call setIntervalAndRun with HOME_GAS_PRICE_UPDATE_INTERVAL interval value on Home', async () => {
      // given
      process.env.HOME_GAS_PRICE_UPDATE_INTERVAL = 15000
      const gasPrice = proxyquire('../src/services/gasPrice', { '../utils/utils': utils })

      // when
      await gasPrice.start('home')

      // then
      expect(process.env.HOME_GAS_PRICE_UPDATE_INTERVAL).to.equal('15000')
      expect(process.env.HOME_GAS_PRICE_UPDATE_INTERVAL).to.not.equal(
        DEFAULT_UPDATE_INTERVAL.toString()
      )
      expect(utils.setIntervalAndRun.args[0][1]).to.equal(
        process.env.HOME_GAS_PRICE_UPDATE_INTERVAL.toString()
      )
    })
    it('should call setIntervalAndRun with FOREIGN_GAS_PRICE_UPDATE_INTERVAL interval value on Foreign', async () => {
      // given
      process.env.FOREIGN_GAS_PRICE_UPDATE_INTERVAL = 15000
      const gasPrice = proxyquire('../src/services/gasPrice', { '../utils/utils': utils })

      // when
      await gasPrice.start('foreign')

      // then
      expect(process.env.FOREIGN_GAS_PRICE_UPDATE_INTERVAL).to.equal('15000')
      expect(process.env.HOME_GAS_PRICE_UPDATE_INTERVAL).to.not.equal(
        DEFAULT_UPDATE_INTERVAL.toString()
      )
      expect(utils.setIntervalAndRun.args[0][1]).to.equal(
        process.env.FOREIGN_GAS_PRICE_UPDATE_INTERVAL.toString()
      )
    })
    it('should call setIntervalAndRun with default interval value on Home', async () => {
      // given
      delete process.env.HOME_GAS_PRICE_UPDATE_INTERVAL
      const gasPrice = proxyquire('../src/services/gasPrice', { '../utils/utils': utils })

      // when
      await gasPrice.start('home')

      // then
      expect(process.env.HOME_GAS_PRICE_UPDATE_INTERVAL).to.equal(undefined)
      expect(utils.setIntervalAndRun.args[0][1]).to.equal(DEFAULT_UPDATE_INTERVAL)
    })
    it('should call setIntervalAndRun with default interval value on Foreign', async () => {
      // given
      delete process.env.FOREIGN_GAS_PRICE_UPDATE_INTERVAL
      const gasPrice = proxyquire('../src/services/gasPrice', { '../utils/utils': utils })

      // when
      await gasPrice.start('foreign')

      // then
      expect(process.env.FOREIGN_GAS_PRICE_UPDATE_INTERVAL).to.equal(undefined)
      expect(utils.setIntervalAndRun.args[0][1]).to.equal(DEFAULT_UPDATE_INTERVAL)
    })
  })
  describe('gasPriceWithinLimits', () => {
    it('should return gas price if gas price is between boundaries', () => {
      // given
      const minGasPrice = 1
      const middleGasPrice = 10
      const maxGasPrice = 250

      // when
      const minGasPriceWithinLimits = gasPriceWithinLimits(minGasPrice)
      const middleGasPriceWithinLimits = gasPriceWithinLimits(middleGasPrice)
      const maxGasPriceWithinLimits = gasPriceWithinLimits(maxGasPrice)

      // then
      expect(minGasPriceWithinLimits).to.equal(minGasPrice)
      expect(middleGasPriceWithinLimits).to.equal(middleGasPrice)
      expect(maxGasPriceWithinLimits).to.equal(maxGasPrice)
    })
    it('should return min limit if gas price is below min boundary', () => {
      // Given
      const initialGasPrice = 0.5

      // When
      const gasPrice = gasPriceWithinLimits(initialGasPrice)

      // Then
      expect(gasPrice).to.equal(GAS_PRICE_BOUNDARIES.MIN)
    })
    it('should return max limit if gas price is above max boundary', () => {
      // Given
      const initialGasPrice = 260

      // When
      const gasPrice = gasPriceWithinLimits(initialGasPrice)

      // Then
      expect(gasPrice).to.equal(GAS_PRICE_BOUNDARIES.MAX)
    })
  })
  describe('normalizeGasPrice', () => {
    it('should work with oracle gas price in gwei', () => {
      // Given
      const oracleGasPrice = 20
      const factor = 1

      // When
      const result = normalizeGasPrice(oracleGasPrice, factor)

      // Then
      expect(result).to.equal('20000000000')
    })
    it('should work with oracle gas price not in gwei', () => {
      // Given
      const oracleGasPrice = 200
      const factor = 0.1

      // When
      const result = normalizeGasPrice(oracleGasPrice, factor)

      // Then
      expect(result).to.equal('20000000000')
    })
    it('should increase gas price value from oracle', () => {
      // Given
      const oracleGasPrice = 20
      const factor = 1.5

      // When
      const result = normalizeGasPrice(oracleGasPrice, factor)

      // Then
      expect(result).to.equal('30000000000')
    })
    it('should respect gas price max limit', () => {
      // Given
      const oracleGasPrice = 200
      const factor = 4
      const maxInWei = Web3Utils.toWei(GAS_PRICE_BOUNDARIES.MAX.toString(), 'gwei')

      // When
      const result = normalizeGasPrice(oracleGasPrice, factor)

      // Then
      expect(result).to.equal(maxInWei)
    })
    it('should respect gas price min limit', () => {
      // Given
      const oracleGasPrice = 1
      const factor = 0.01
      const minInWei = Web3Utils.toWei(GAS_PRICE_BOUNDARIES.MIN.toString(), 'gwei')

      // When
      const result = normalizeGasPrice(oracleGasPrice, factor)

      // Then
      expect(result).to.equal(minInWei)
    })
  })
  describe('processGasPriceOptions', () => {
    const oracleMockResponse = {
      fast: 17.64,
      block_time: 13.548,
      health: true,
      standard: 10.64,
      block_number: 6704240,
      instant: 51.9,
      slow: 4.4
    }
    it('should return cached gas price if no options provided', async () => {
      // given
      const options = {}
      const cachedGasPrice = '1000000000'

      // when
      const gasPrice = await processGasPriceOptions({
        options,
        cachedGasPrice,
        cachedGasPriceOracleSpeeds: oracleMockResponse
      })

      // then
      expect(gasPrice).to.equal(cachedGasPrice)
    })
    it('should return gas price provided by options', async () => {
      // given
      const options = {
        type: GAS_PRICE_OPTIONS.GAS_PRICE,
        value: '3000000000'
      }
      const cachedGasPrice = '1000000000'

      // when
      const gasPrice = await processGasPriceOptions({
        options,
        cachedGasPrice,
        cachedGasPriceOracleSpeeds: oracleMockResponse
      })

      // then
      expect(gasPrice).to.equal(options.value)
    })
    it('should return gas price provided by oracle speed option', async () => {
      // given
      const options = {
        type: GAS_PRICE_OPTIONS.SPEED,
        value: ORACLE_GAS_PRICE_SPEEDS.STANDARD
      }
      const cachedGasPrice = '1000000000'
      const oracleGasPriceGwei = oracleMockResponse[ORACLE_GAS_PRICE_SPEEDS.STANDARD]
      const oracleGasPrice = Web3Utils.toWei(oracleGasPriceGwei.toString(), 'gwei')

      // when
      const gasPrice = await processGasPriceOptions({
        options,
        cachedGasPrice,
        cachedGasPriceOracleSpeeds: oracleMockResponse
      })

      // then
      expect(gasPrice).to.equal(oracleGasPrice)
    })
    it('should return cached gas price if invalid speed option', async () => {
      // given
      const options = {
        type: GAS_PRICE_OPTIONS.SPEED,
        value: 'unknown'
      }
      const cachedGasPrice = '1000000000'

      // when
      const gasPrice = await processGasPriceOptions({
        options,
        cachedGasPrice,
        cachedGasPriceOracleSpeeds: oracleMockResponse
      })

      // then
      expect(gasPrice).to.equal(cachedGasPrice)
    })
  })
})
