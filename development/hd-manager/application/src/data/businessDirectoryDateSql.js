export const entityDates = ['date','requestDate','requestDateKey','orderRequestDate','sourceOrderRequestDate','dispatchDate','deliveryDate',
  'createdAt','updatedAt','timestamp','receivedAt','sentAt','approvedAt','paidAt','lastMessageAt','lastActivityAt'];
// Values come from json_each, hence scalar types remain distinct. Numeric
// business dates are epoch milliseconds (getDateKeyFromAnyValue); Firestore
// Timestamp objects use seconds. Unzoned strings retain their Vietnam day.
export function dateSql(candidates) {
  return `(WITH RECURSIVE candidates AS (SELECT key, value AS v,type FROM json_each(json_array(${candidates.join(',')}))),
    unwrapped(key,v,type,depth) AS (SELECT key,v,type,0 FROM candidates UNION ALL
      SELECT key,COALESCE(json_extract(v,'$.timestampValue'),json_extract(v,'$.stringValue'),
        json_extract(v,'$.integerValue'),json_extract(v,'$.doubleValue'),json_extract(v,'$.value')),
        'text',depth+1 FROM unwrapped WHERE type='object' AND depth<4
        AND COALESCE(json_extract(v,'$.seconds'),json_extract(v,'$._seconds')) IS NULL),
    texts AS (SELECT *,trim(v) AS txt FROM unwrapped),
    normalized AS (SELECT *,replace(txt,'/','-') AS vn,
      CASE WHEN instr(txt,'.')>0 THEN substr(txt,1,instr(txt,'.')-1)||
        CASE WHEN lower(substr(txt,-1))='z' THEN 'Z'
          WHEN substr(txt,-6) GLOB '[+-][0-9][0-9]:[0-9][0-9]' THEN substr(txt,-6) ELSE '' END
        ELSE txt END AS iso FROM texts),
    parts AS (SELECT *,instr(vn,'-') AS p FROM normalized),
    parts2 AS (SELECT *,instr(substr(vn,p+1),'-') AS q FROM parts),
    vietnamese AS (SELECT *,CASE WHEN p IN (2,3) AND q IN (2,3)
      AND substr(vn,1,p-1) NOT GLOB '*[^0-9]*'
      AND substr(vn,p+1,q-1) NOT GLOB '*[^0-9]*'
      AND substr(vn,p+q+1,4) GLOB '[0-9][0-9][0-9][0-9]'
      THEN printf('%04d-%02d-%02d',CAST(substr(vn,p+q+1,4) AS INTEGER),
        CAST(substr(vn,p+1,q-1) AS INTEGER),CAST(substr(vn,1,p-1) AS INTEGER)) END AS vn_day FROM parts2),
    parsed AS (SELECT key,depth,CASE
      WHEN type='object' THEN date(COALESCE(json_extract(v,'$.seconds'),json_extract(v,'$._seconds')),'unixepoch','+7 hours')
      WHEN typeof(v) IN ('integer','real') THEN date(v/1000.0,'unixepoch','+7 hours')
      WHEN typeof(v)='text' THEN CASE
        WHEN length(txt)>=10 AND substr(txt,1,10) GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
          AND date(substr(txt,1,10),'+0 days')=substr(txt,1,10)
          THEN CASE WHEN length(txt)=10 THEN substr(txt,1,10)
            WHEN substr(txt,11,1) IN ('T',' ') AND substr(txt,12,5) GLOB '[0-9][0-9]:[0-9][0-9]'
              AND CAST(substr(txt,12,2) AS INTEGER)<24 AND CAST(substr(txt,15,2) AS INTEGER)<60 THEN
              CASE WHEN substr(iso,11) GLOB '*[Zz]' OR substr(iso,11) GLOB '*[+-][0-9][0-9]:[0-9][0-9]'
                THEN date(iso,'+7 hours') ELSE date(iso) END END
        WHEN vn_day IS NOT NULL AND date(vn_day,'+0 days')=vn_day THEN vn_day
        ELSE NULL END
      END AS d FROM vietnamese)
    SELECT d FROM parsed WHERE d IS NOT NULL ORDER BY key,depth DESC LIMIT 1)`;
}

// Orders only: accelerate the original first candidate for exact ISO19 local
// and ISO24 UTC strings. Calendar/time/type/NUL guards retain the original
// recursive parser for every other value and for any NULL fast-path result.
export function ordersStrictIsoDateSql(candidates) {
  if(!candidates.length)return dateSql(candidates);
  const first=candidates[0];
  return `COALESCE(CASE WHEN typeof(${first})='text' AND instr(${first},char(0))=0
    AND CAST(substr(${first},12,2) AS INTEGER)<24
    AND CAST(substr(${first},15,2) AS INTEGER)<60 AND CAST(substr(${first},18,2) AS INTEGER)<60
    AND date(substr(${first},1,10),'+0 days')=substr(${first},1,10)
    THEN CASE
      WHEN length(${first})=19 AND ${first} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]'
        THEN date(${first})
      WHEN length(${first})=24 AND ${first} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
        THEN date(${first},'+7 hours')
    END END,${dateSql(candidates)})`;
}


// Same Orders expression used by reads and canonical projection writes.
export function orderBusinessSortSql(body='r.body'){
 const j=field=>`json_extract(${body},'$.${field}')`;
 const first=`COALESCE(${entityDates.slice(0,7).map(field=>`NULLIF(${j(field)},'')`).join(',')},'')`;
 return `COALESCE(${ordersStrictIsoDateSql([first,...entityDates.slice(7).map(j)])},'')`;
}
