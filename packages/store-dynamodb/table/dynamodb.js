export default (table, { timeToLiveKey } = {}) => {
  timeToLiveKey ??= 'remove'
  return {
    TableName: table,
    AttributeDefinitions: [
      {
        AttributeName: 'sub',
        AttributeType: 'S'
      },
      {
        AttributeName: 'id',
        AttributeType: 'N'
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
          NonKeyAttributes: ['value', 'create', 'expire']
        }
      },
      {
        IndexName: 'key',
        KeySchema: [
          {
            AttributeName: 'id',
            KeyType: 'HASH'
          }
        ],
        Projection: {
          ProjectionType: 'INCLUDE',
          NonKeyAttributes: ['value', 'create', 'expire']
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
