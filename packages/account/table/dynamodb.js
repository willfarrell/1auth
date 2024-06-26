export default (table, { timeToLiveKey } = {}) => {
  timeToLiveKey ??= 'remove'
  return {
    TableName: table,
    AttributeDefinitions: [
      {
        AttributeName: 'id',
        AttributeType: 'S'
      },
      {
        AttributeName: 'sub',
        AttributeType: 'S'
      }
      // {
      //   AttributeName: "expire",
      //   AttributeType: "N",
      // },
    ],
    KeySchema: [
      {
        AttributeName: 'sub',
        KeyType: 'HASH'
      },
      {
        AttributeName: 'id',
        KeyType: 'RANGE'
      }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'sub',
        KeySchema: [
          {
            AttributeName: 'sub',
            KeyType: 'HASH'
          }
        ],
        Projection: {
          ProjectionType: 'INCLUDE',
          NonKeyAttributes: ['id', 'value', 'create', 'expire']
        }
      },
      {
        IndexName: 'digest',
        KeySchema: [
          {
            AttributeName: 'digest',
            KeyType: 'HASH'
          }
        ],
        Projection: {
          ProjectionType: 'INCLUDE',
          NonKeyAttributes: ['sub', 'value', 'create', 'expire']
        }
      }
    ],
    TimeToLiveSpecification: {
      Enabled: true,
      AttributeName: timeToLiveKey
    },
    BillingMode: 'PAY_PER_REQUEST'
  }
}
