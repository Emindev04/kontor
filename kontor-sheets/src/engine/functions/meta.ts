// Function signatures and descriptions for autocomplete, tooltips and the Insert Function dialog.
// Format: NAME|category code|arguments|description

export type FnCategory = 'Financial' | 'Logical' | 'Text' | 'Date & Time' | 'Lookup & Reference' | 'Math & Trig' | 'Statistical' | 'Engineering' | 'Information' | 'Database' | 'Compatibility' | 'Web'

const CATS: Record<string, FnCategory> = { F: 'Financial', L: 'Logical', T: 'Text', D: 'Date & Time', R: 'Lookup & Reference', M: 'Math & Trig', S: 'Statistical', E: 'Engineering', I: 'Information', B: 'Database', C: 'Compatibility', W: 'Web' }

export const CATEGORY_ORDER: FnCategory[] = ['Financial', 'Logical', 'Text', 'Date & Time', 'Lookup & Reference', 'Math & Trig', 'Statistical', 'Engineering', 'Information', 'Database', 'Compatibility', 'Web']

const RAW = `
AMORDEGRC|F|cost, date_purchased, first_period, salvage, period, rate, [basis]|Returns the depreciation for each accounting period by using a depreciation coefficient.
AMORLINC|F|cost, date_purchased, first_period, salvage, period, rate, [basis]|Returns the depreciation for each accounting period.
ODDFPRICE|F|settlement, maturity, issue, first_coupon, rate, yld, redemption, frequency, [basis]|Returns the price per $100 face value of a security with an odd first period.
ODDFYIELD|F|settlement, maturity, issue, first_coupon, rate, pr, redemption, frequency, [basis]|Returns the yield of a security with an odd first period.
ODDLPRICE|F|settlement, maturity, last_interest, rate, yld, redemption, frequency, [basis]|Returns the price per $100 face value of a security with an odd last period.
ODDLYIELD|F|settlement, maturity, last_interest, rate, pr, redemption, frequency, [basis]|Returns the yield of a security with an odd last period.
ACCRINT|F|issue, first_interest, settlement, rate, par, frequency, [basis], [calc_method]|Returns the accrued interest for a security that pays periodic interest.
ACCRINTM|F|issue, settlement, rate, par, [basis]|Returns the accrued interest for a security that pays interest at maturity.
BESSELI|E|x, n|Returns the modified Bessel function In(x).
BESSELJ|E|x, n|Returns the Bessel function Jn(x).
BESSELK|E|x, n|Returns the modified Bessel function Kn(x).
BESSELY|E|x, n|Returns the Bessel function Yn(x).
COMPLEX|E|real_num, i_num, [suffix]|Converts real and imaginary coefficients into a complex number.
COUPDAYBS|F|settlement, maturity, frequency, [basis]|Returns the number of days from the beginning of the coupon period to the settlement date.
COUPDAYS|F|settlement, maturity, frequency, [basis]|Returns the number of days in the coupon period that contains the settlement date.
COUPDAYSNC|F|settlement, maturity, frequency, [basis]|Returns the number of days from the settlement date to the next coupon date.
COUPNCD|F|settlement, maturity, frequency, [basis]|Returns the next coupon date after the settlement date.
COUPNUM|F|settlement, maturity, frequency, [basis]|Returns the number of coupons payable between the settlement date and maturity date.
COUPPCD|F|settlement, maturity, frequency, [basis]|Returns the previous coupon date before the settlement date.
DISC|F|settlement, maturity, pr, redemption, [basis]|Returns the discount rate for a security.
DURATION|F|settlement, maturity, coupon, yld, frequency, [basis]|Returns the annual duration of a security with periodic interest payments.
IMABS|E|inumber|Returns the absolute value (modulus) of a complex number.
IMAGINARY|E|inumber|Returns the imaginary coefficient of a complex number.
IMARGUMENT|E|inumber|Returns the argument theta, an angle expressed in radians.
IMCONJUGATE|E|inumber|Returns the complex conjugate of a complex number.
IMCOS|E|inumber|Returns the cosine of a complex number.
IMCOSH|E|inumber|Returns the hyperbolic cosine of a complex number.
IMCOT|E|inumber|Returns the cotangent of a complex number.
IMCSC|E|inumber|Returns the cosecant of a complex number.
IMCSCH|E|inumber|Returns the hyperbolic cosecant of a complex number.
IMDIV|E|inumber1, inumber2|Returns the quotient of two complex numbers.
IMEXP|E|inumber|Returns the exponential of a complex number.
IMLN|E|inumber|Returns the natural logarithm of a complex number.
IMLOG10|E|inumber|Returns the base-10 logarithm of a complex number.
IMLOG2|E|inumber|Returns the base-2 logarithm of a complex number.
IMPOWER|E|inumber, number|Returns a complex number raised to an integer power.
IMPRODUCT|E|inumber1, [inumber2], …|Returns the product of complex numbers.
IMREAL|E|inumber|Returns the real coefficient of a complex number.
IMSEC|E|inumber|Returns the secant of a complex number.
IMSECH|E|inumber|Returns the hyperbolic secant of a complex number.
IMSIN|E|inumber|Returns the sine of a complex number.
IMSINH|E|inumber|Returns the hyperbolic sine of a complex number.
IMSQRT|E|inumber|Returns the square root of a complex number.
IMSUB|E|inumber1, inumber2|Returns the difference between two complex numbers.
IMSUM|E|inumber1, [inumber2], …|Returns the sum of complex numbers.
IMTAN|E|inumber|Returns the tangent of a complex number.
INTRATE|F|settlement, maturity, investment, redemption, [basis]|Returns the interest rate for a fully invested security.
MDURATION|F|settlement, maturity, coupon, yld, frequency, [basis]|Returns the modified Macaulay duration for a security.
PRICE|F|settlement, maturity, rate, yld, redemption, frequency, [basis]|Returns the price per $100 face value of a security that pays periodic interest.
PRICEDISC|F|settlement, maturity, discount, redemption, [basis]|Returns the price per $100 face value of a discounted security.
PRICEMAT|F|settlement, maturity, issue, rate, yld, [basis]|Returns the price per $100 face value of a security that pays interest at maturity.
RECEIVED|F|settlement, maturity, investment, discount, [basis]|Returns the amount received at maturity for a fully invested security.
TBILLEQ|F|settlement, maturity, discount|Returns the bond-equivalent yield for a Treasury bill.
TBILLPRICE|F|settlement, maturity, discount|Returns the price per $100 face value for a Treasury bill.
TBILLYIELD|F|settlement, maturity, pr|Returns the yield for a Treasury bill.
YIELD|F|settlement, maturity, rate, pr, redemption, frequency, [basis]|Returns the yield on a security that pays periodic interest.
YIELDDISC|F|settlement, maturity, pr, redemption, [basis]|Returns the annual yield for a discounted security.
YIELDMAT|F|settlement, maturity, issue, rate, pr, [basis]|Returns the annual yield of a security that pays interest at maturity.
ABS|M|number|Returns the absolute value of a number.
ACOS|M|number|Returns the arccosine of a number, in radians.
ACOSH|M|number|Returns the inverse hyperbolic cosine of a number.
ACOT|M|number|Returns the arccotangent of a number.
ACOTH|M|number|Returns the inverse hyperbolic cotangent of a number.
ADDRESS|R|row_num, column_num, [abs_num], [a1], [sheet_text]|Creates a cell reference as text from row and column numbers.
AGGREGATE|M|function_num, options, ref1, [ref2], …|Returns an aggregate (sum, average, count…) with options to ignore hidden rows and errors.
AND|L|logical1, [logical2], …|Returns TRUE if all arguments are TRUE.
ARABIC|M|text|Converts a Roman numeral to an Arabic number.
AREAS|R|reference|Returns the number of areas in a reference.
ARRAYTOTEXT|T|array, [format]|Returns an array of values as text.
ASC|T|text|Changes full-width characters to half-width.
ASIN|M|number|Returns the arcsine of a number, in radians.
ASINH|M|number|Returns the inverse hyperbolic sine of a number.
ATAN|M|number|Returns the arctangent of a number, in radians.
ATAN2|M|x_num, y_num|Returns the arctangent of x and y coordinates.
ATANH|M|number|Returns the inverse hyperbolic tangent of a number.
AVEDEV|S|number1, [number2], …|Returns the average of the absolute deviations from the mean.
AVERAGE|S|number1, [number2], …|Returns the average (arithmetic mean) of its arguments.
AVERAGEA|S|value1, [value2], …|Returns the average including text (as 0) and logical values.
AVERAGEIF|S|range, criteria, [average_range]|Averages the cells that meet a condition.
AVERAGEIFS|S|average_range, criteria_range1, criteria1, …|Averages the cells that meet several conditions.
BASE|M|number, radix, [min_length]|Converts a number to text in the given base.
BETA.DIST|S|x, alpha, beta, cumulative, [A], [B]|Returns the beta distribution.
BETA.INV|S|probability, alpha, beta, [A], [B]|Returns the inverse of the beta cumulative distribution.
BETADIST|C|x, alpha, beta, [A], [B]|Returns the beta cumulative distribution.
BETAINV|C|probability, alpha, beta, [A], [B]|Returns the inverse of the beta cumulative distribution.
BIN2DEC|E|number|Converts a binary number to decimal.
BIN2HEX|E|number, [places]|Converts a binary number to hexadecimal.
BIN2OCT|E|number, [places]|Converts a binary number to octal.
BINOM.DIST|S|number_s, trials, probability_s, cumulative|Returns the binomial distribution probability.
BINOM.DIST.RANGE|S|trials, probability_s, number_s, [number_s2]|Returns the probability of a trial result range.
BINOM.INV|S|trials, probability_s, alpha|Returns the smallest value whose cumulative binomial distribution is at least alpha.
BINOMDIST|C|number_s, trials, probability_s, cumulative|Returns the binomial distribution probability.
BITAND|E|number1, number2|Returns a bitwise AND of two numbers.
BITLSHIFT|E|number, shift_amount|Shifts a number left by bits.
BITOR|E|number1, number2|Returns a bitwise OR of two numbers.
BITRSHIFT|E|number, shift_amount|Shifts a number right by bits.
BITXOR|E|number1, number2|Returns a bitwise exclusive OR of two numbers.
BYCOL|L|array, lambda|Applies a LAMBDA to each column and returns an array of results.
BYROW|L|array, lambda|Applies a LAMBDA to each row and returns an array of results.
CEILING|M|number, significance|Rounds a number up to the nearest multiple of significance.
CEILING.MATH|M|number, [significance], [mode]|Rounds a number up to the nearest integer or multiple.
CEILING.PRECISE|M|number, [significance]|Rounds a number up regardless of its sign.
CELL|I|info_type, [reference]|Returns information about the formatting, location or contents of a cell.
CHAR|T|number|Returns the character for a code number.
CHIDIST|C|x, deg_freedom|Returns the right-tailed chi-squared distribution.
CHIINV|C|probability, deg_freedom|Returns the inverse of the right-tailed chi-squared distribution.
CHISQ.DIST|S|x, deg_freedom, cumulative|Returns the left-tailed chi-squared distribution.
CHISQ.DIST.RT|S|x, deg_freedom|Returns the right-tailed chi-squared distribution.
CHISQ.INV|S|probability, deg_freedom|Returns the inverse of the left-tailed chi-squared distribution.
CHISQ.INV.RT|S|probability, deg_freedom|Returns the inverse of the right-tailed chi-squared distribution.
CHISQ.TEST|S|actual_range, expected_range|Returns the test for independence.
CHITEST|C|actual_range, expected_range|Returns the test for independence.
CHOOSE|R|index_num, value1, [value2], …|Chooses a value from a list by index.
CHOOSECOLS|R|array, col_num1, [col_num2], …|Returns the specified columns of an array.
CHOOSEROWS|R|array, row_num1, [row_num2], …|Returns the specified rows of an array.
CLEAN|T|text|Removes non-printable characters from text.
CODE|T|text|Returns the numeric code of the first character.
COLUMN|R|[reference]|Returns the column number of a reference.
COLUMNS|R|array|Returns the number of columns in a reference or array.
COMBIN|M|number, number_chosen|Returns the number of combinations.
COMBINA|M|number, number_chosen|Returns the number of combinations with repetitions.
CONCAT|T|text1, [text2], …|Joins text from several ranges and/or strings.
CONCATENATE|T|text1, [text2], …|Joins several text items into one.
CONFIDENCE|C|alpha, standard_dev, size|Returns the confidence interval for a population mean.
CONFIDENCE.NORM|S|alpha, standard_dev, size|Returns the confidence interval using a normal distribution.
CONFIDENCE.T|S|alpha, standard_dev, size|Returns the confidence interval using a Student's t distribution.
CONVERT|E|number, from_unit, to_unit|Converts a number from one measurement system to another.
CORREL|S|array1, array2|Returns the correlation coefficient of two data sets.
COS|M|number|Returns the cosine of an angle.
COSH|M|number|Returns the hyperbolic cosine of a number.
COT|M|number|Returns the cotangent of an angle.
COTH|M|number|Returns the hyperbolic cotangent of a number.
COUNT|S|value1, [value2], …|Counts the cells that contain numbers.
COUNTA|S|value1, [value2], …|Counts the cells that are not empty.
COUNTBLANK|S|range|Counts the empty cells in a range.
COUNTIF|S|range, criteria|Counts the cells that meet a condition.
COUNTIFS|S|criteria_range1, criteria1, …|Counts the cells that meet several conditions.
COVAR|C|array1, array2|Returns the population covariance.
COVARIANCE.P|S|array1, array2|Returns the population covariance.
COVARIANCE.S|S|array1, array2|Returns the sample covariance.
CRITBINOM|C|trials, probability_s, alpha|Returns the smallest value whose cumulative binomial distribution is at least alpha.
CSC|M|number|Returns the cosecant of an angle.
CSCH|M|number|Returns the hyperbolic cosecant of an angle.
CUMIPMT|F|rate, nper, pv, start_period, end_period, type|Returns the cumulative interest paid between two periods.
CUMPRINC|F|rate, nper, pv, start_period, end_period, type|Returns the cumulative principal paid between two periods.
DATE|D|year, month, day|Returns the serial number of a date.
DATEDIF|D|start_date, end_date, unit|Returns the days, months or years between two dates.
DATEVALUE|D|date_text|Converts a date in text form to a serial number.
DAVERAGE|B|database, field, criteria|Averages the matching database entries.
DAY|D|serial_number|Returns the day of the month (1–31).
DAYS|D|end_date, start_date|Returns the number of days between two dates.
DAYS360|D|start_date, end_date, [method]|Returns the days between two dates based on a 360-day year.
DB|F|cost, salvage, life, period, [month]|Returns depreciation using the fixed-declining balance method.
DBCS|T|text|Changes half-width characters to full-width.
DCOUNT|B|database, field, criteria|Counts the cells with numbers in matching database entries.
DCOUNTA|B|database, field, criteria|Counts the non-empty cells in matching database entries.
DDB|F|cost, salvage, life, period, [factor]|Returns depreciation using the double-declining balance method.
DEC2BIN|E|number, [places]|Converts a decimal number to binary.
DEC2HEX|E|number, [places]|Converts a decimal number to hexadecimal.
DEC2OCT|E|number, [places]|Converts a decimal number to octal.
DECIMAL|M|text, radix|Converts text in a given base to a decimal number.
DEGREES|M|angle|Converts radians to degrees.
DELTA|E|number1, [number2]|Tests whether two values are equal.
DEVSQ|S|number1, [number2], …|Returns the sum of squares of deviations.
DGET|B|database, field, criteria|Extracts the single record that matches the criteria.
DMAX|B|database, field, criteria|Returns the largest value in matching database entries.
DMIN|B|database, field, criteria|Returns the smallest value in matching database entries.
DOLLAR|T|number, [decimals]|Converts a number to text in currency format.
DOLLARDE|F|fractional_dollar, fraction|Converts a dollar price expressed as a fraction into a decimal.
DOLLARFR|F|decimal_dollar, fraction|Converts a decimal dollar price into a fraction.
DPRODUCT|B|database, field, criteria|Multiplies values in matching database entries.
DROP|R|array, rows, [columns]|Drops rows or columns from the start or end of an array.
DSTDEV|B|database, field, criteria|Estimates the standard deviation from matching entries.
DSTDEVP|B|database, field, criteria|Calculates the population standard deviation of matching entries.
DSUM|B|database, field, criteria|Adds the numbers in matching database entries.
DVAR|B|database, field, criteria|Estimates the variance from matching entries.
DVARP|B|database, field, criteria|Calculates the population variance of matching entries.
EDATE|D|start_date, months|Returns the date a number of months before or after a date.
EFFECT|F|nominal_rate, npery|Returns the effective annual interest rate.
ENCODEURL|W|text|Returns a URL-encoded string.
EOMONTH|D|start_date, months|Returns the last day of the month a number of months away.
ERF|E|lower_limit, [upper_limit]|Returns the error function.
ERF.PRECISE|E|x|Returns the error function.
ERFC|E|x|Returns the complementary error function.
ERFC.PRECISE|E|x|Returns the complementary error function.
ERROR.TYPE|I|error_val|Returns a number corresponding to an error type.
EVEN|M|number|Rounds a number up to the nearest even integer.
EXACT|T|text1, text2|Checks whether two texts are exactly the same (case-sensitive).
EXP|M|number|Returns e raised to the power of a number.
EXPAND|R|array, rows, [columns], [pad_with]|Expands an array to the given size.
EXPON.DIST|S|x, lambda, cumulative|Returns the exponential distribution.
EXPONDIST|C|x, lambda, cumulative|Returns the exponential distribution.
F.DIST|S|x, deg_freedom1, deg_freedom2, cumulative|Returns the F probability distribution.
F.DIST.RT|S|x, deg_freedom1, deg_freedom2|Returns the right-tailed F probability distribution.
F.INV|S|probability, deg_freedom1, deg_freedom2|Returns the inverse of the F distribution.
F.INV.RT|S|probability, deg_freedom1, deg_freedom2|Returns the inverse of the right-tailed F distribution.
F.TEST|S|array1, array2|Returns the result of an F-test.
FACT|M|number|Returns the factorial of a number.
FACTDOUBLE|M|number|Returns the double factorial of a number.
FALSE|L||Returns the logical value FALSE.
FDIST|C|x, deg_freedom1, deg_freedom2|Returns the right-tailed F probability distribution.
FILTER|R|array, include, [if_empty]|Filters a range based on criteria you define.
FIND|T|find_text, within_text, [start_num]|Finds text within text (case-sensitive).
FINDB|T|find_text, within_text, [start_num]|Finds text within text (case-sensitive).
FINV|C|probability, deg_freedom1, deg_freedom2|Returns the inverse of the right-tailed F distribution.
FISHER|S|x|Returns the Fisher transformation.
FISHERINV|S|y|Returns the inverse of the Fisher transformation.
FIXED|T|number, [decimals], [no_commas]|Formats a number as text with a fixed number of decimals.
FLOOR|M|number, significance|Rounds a number down to the nearest multiple of significance.
FLOOR.MATH|M|number, [significance], [mode]|Rounds a number down to the nearest integer or multiple.
FLOOR.PRECISE|M|number, [significance]|Rounds a number down regardless of its sign.
FORECAST|C|x, known_ys, known_xs|Predicts a value along a linear trend.
FORECAST.ETS|S|target_date, values, timeline, [seasonality], [data_completion], [aggregation]|Returns a future value based on existing values by using exponential triple smoothing.
FORECAST.ETS.CONFINT|S|target_date, values, timeline, [confidence_level], [seasonality], [data_completion], [aggregation]|Returns a confidence interval for the forecast value at the specified target date.
FORECAST.ETS.SEASONALITY|S|values, timeline, [data_completion], [aggregation]|Returns the length of the repetitive pattern detected for the specified time series.
FORECAST.ETS.STAT|S|values, timeline, statistic_type, [seasonality], [data_completion], [aggregation]|Returns a statistical value as a result of time series forecasting.
FORECAST.LINEAR|S|x, known_ys, known_xs|Predicts a value along a linear trend.
FORMULATEXT|R|reference|Returns the formula of a cell as text.
FREQUENCY|S|data_array, bins_array|Calculates how often values occur within ranges.
FTEST|C|array1, array2|Returns the result of an F-test.
FV|F|rate, nper, pmt, [pv], [type]|Returns the future value of an investment.
FVSCHEDULE|F|principal, schedule|Returns the future value after applying a series of rates.
GAMMA|S|x|Returns the Gamma function value.
GAMMA.DIST|S|x, alpha, beta, cumulative|Returns the gamma distribution.
GAMMA.INV|S|probability, alpha, beta|Returns the inverse of the gamma cumulative distribution.
GAMMADIST|C|x, alpha, beta, cumulative|Returns the gamma distribution.
GAMMAINV|C|probability, alpha, beta|Returns the inverse of the gamma cumulative distribution.
GAMMALN|S|x|Returns the natural logarithm of the gamma function.
GAMMALN.PRECISE|S|x|Returns the natural logarithm of the gamma function.
GAUSS|S|z|Returns 0.5 less than the standard normal cumulative distribution.
GCD|M|number1, [number2], …|Returns the greatest common divisor.
GEOMEAN|S|number1, [number2], …|Returns the geometric mean.
GESTEP|E|number, [step]|Tests whether a number is greater than or equal to a threshold.
GROWTH|S|known_ys, [known_xs], [new_xs], [const]|Returns values along an exponential trend.
HARMEAN|S|number1, [number2], …|Returns the harmonic mean.
HEX2BIN|E|number, [places]|Converts a hexadecimal number to binary.
HEX2DEC|E|number|Converts a hexadecimal number to decimal.
HEX2OCT|E|number, [places]|Converts a hexadecimal number to octal.
HLOOKUP|R|lookup_value, table_array, row_index_num, [range_lookup]|Looks up a value in the top row of a table and returns a value from the same column.
HOUR|D|serial_number|Returns the hour (0–23).
HSTACK|R|array1, [array2], …|Appends arrays horizontally.
HYPERLINK|R|link_location, [friendly_name]|Creates a link to a web page or file.
HYPGEOM.DIST|S|sample_s, number_sample, population_s, number_pop, cumulative|Returns the hypergeometric distribution.
HYPGEOMDIST|C|sample_s, number_sample, population_s, number_pop|Returns the hypergeometric distribution.
IF|L|logical_test, [value_if_true], [value_if_false]|Returns one value if a condition is TRUE and another if it is FALSE.
IFERROR|L|value, value_if_error|Returns a value you specify if a formula results in an error.
IFNA|L|value, value_if_na|Returns a value you specify if a formula results in #N/A.
IFS|L|logical_test1, value_if_true1, …|Returns the value for the first TRUE condition.
INDEX|R|array, row_num, [column_num], [area_num]|Returns a value or reference at a row and column of a range.
INDIRECT|R|ref_text, [a1]|Returns the reference specified by a text string.
INFO|I|type_text|Returns information about the operating environment.
INT|M|number|Rounds a number down to the nearest integer.
INTERCEPT|S|known_ys, known_xs|Returns the intercept of the linear regression line.
IPMT|F|rate, per, nper, pv, [fv], [type]|Returns the interest payment for a period.
IRR|F|values, [guess]|Returns the internal rate of return for cash flows.
ISBLANK|I|value|Returns TRUE if the value is empty.
ISERR|I|value|Returns TRUE if the value is any error except #N/A.
ISERROR|I|value|Returns TRUE if the value is any error.
ISEVEN|I|number|Returns TRUE if the number is even.
ISFORMULA|I|reference|Returns TRUE if the cell contains a formula.
ISLOGICAL|I|value|Returns TRUE if the value is a logical value.
ISNA|I|value|Returns TRUE if the value is #N/A.
ISNONTEXT|I|value|Returns TRUE if the value is not text.
ISNUMBER|I|value|Returns TRUE if the value is a number.
ISO.CEILING|M|number, [significance]|Rounds a number up to the nearest integer or multiple.
ISODD|I|number|Returns TRUE if the number is odd.
ISOMITTED|I|argument|Checks whether a LAMBDA argument is missing.
ISOWEEKNUM|D|date|Returns the ISO week number of the year.
ISPMT|F|rate, per, nper, pv|Returns the interest paid during a period of an investment.
ISREF|I|value|Returns TRUE if the value is a reference.
ISTEXT|I|value|Returns TRUE if the value is text.
KURT|S|number1, [number2], …|Returns the kurtosis of a data set.
LAMBDA|L|[parameter1, …], calculation|Creates a custom, reusable function.
LARGE|S|array, k|Returns the k-th largest value in a data set.
LCM|M|number1, [number2], …|Returns the least common multiple.
LEFT|T|text, [num_chars]|Returns the leftmost characters of a text.
LEFTB|T|text, [num_bytes]|Returns the leftmost characters of a text.
LEN|T|text|Returns the number of characters in a text.
LENB|T|text|Returns the number of characters in a text.
LET|L|name1, value1, [name2, value2, …], calculation|Assigns names to calculation results.
LINEST|S|known_ys, [known_xs], [const], [stats]|Returns statistics of a linear trend.
LN|M|number|Returns the natural logarithm.
LOG|M|number, [base]|Returns the logarithm to the base you specify.
LOG10|M|number|Returns the base-10 logarithm.
LOGEST|S|known_ys, [known_xs], [const], [stats]|Returns statistics of an exponential curve.
LOGINV|C|probability, mean, standard_dev|Returns the inverse of the lognormal distribution.
LOGNORM.DIST|S|x, mean, standard_dev, cumulative|Returns the lognormal distribution.
LOGNORM.INV|S|probability, mean, standard_dev|Returns the inverse of the lognormal distribution.
LOGNORMDIST|C|x, mean, standard_dev|Returns the cumulative lognormal distribution.
LOOKUP|R|lookup_value, lookup_vector, [result_vector]|Looks up a value in a one-row or one-column range.
LOWER|T|text|Converts text to lowercase.
MAKEARRAY|L|rows, cols, lambda|Returns an array of the given size computed by a LAMBDA.
MAP|L|array1, [array2, …], lambda|Maps each value of the arrays to a new value with a LAMBDA.
MATCH|R|lookup_value, lookup_array, [match_type]|Returns the relative position of an item in a range.
MAX|S|number1, [number2], …|Returns the largest value.
MAXA|S|value1, [value2], …|Returns the largest value including text and logical values.
MAXIFS|S|max_range, criteria_range1, criteria1, …|Returns the largest value that meets conditions.
MDETERM|M|array|Returns the matrix determinant.
MEDIAN|S|number1, [number2], …|Returns the median of the numbers.
MID|T|text, start_num, num_chars|Returns characters from the middle of a text.
MIDB|T|text, start_num, num_bytes|Returns characters from the middle of a text.
MIN|S|number1, [number2], …|Returns the smallest value.
MINA|S|value1, [value2], …|Returns the smallest value including text and logical values.
MINIFS|S|min_range, criteria_range1, criteria1, …|Returns the smallest value that meets conditions.
MINUTE|D|serial_number|Returns the minute (0–59).
MINVERSE|M|array|Returns the inverse matrix.
MIRR|F|values, finance_rate, reinvest_rate|Returns the modified internal rate of return.
MMULT|M|array1, array2|Returns the matrix product of two arrays.
MOD|M|number, divisor|Returns the remainder after division.
MODE|C|number1, [number2], …|Returns the most common value.
MODE.MULT|S|number1, [number2], …|Returns a vertical array of the most frequent values.
MODE.SNGL|S|number1, [number2], …|Returns the most common value.
MONTH|D|serial_number|Returns the month (1–12).
MROUND|M|number, multiple|Rounds a number to the nearest multiple.
MULTINOMIAL|M|number1, [number2], …|Returns the multinomial of a set of numbers.
MUNIT|M|dimension|Returns the identity matrix.
N|I|value|Converts a value to a number.
NA|I||Returns the error value #N/A.
NEGBINOM.DIST|S|number_f, number_s, probability_s, cumulative|Returns the negative binomial distribution.
NEGBINOMDIST|C|number_f, number_s, probability_s|Returns the negative binomial distribution.
NETWORKDAYS|D|start_date, end_date, [holidays]|Returns the number of whole workdays between two dates.
NETWORKDAYS.INTL|D|start_date, end_date, [weekend], [holidays]|Returns the workdays between two dates with custom weekends.
NOMINAL|F|effect_rate, npery|Returns the nominal annual interest rate.
NORM.DIST|S|x, mean, standard_dev, cumulative|Returns the normal distribution.
NORM.INV|S|probability, mean, standard_dev|Returns the inverse of the normal cumulative distribution.
NORM.S.DIST|S|z, cumulative|Returns the standard normal distribution.
NORM.S.INV|S|probability|Returns the inverse of the standard normal distribution.
NORMDIST|C|x, mean, standard_dev, cumulative|Returns the normal distribution.
NORMINV|C|probability, mean, standard_dev|Returns the inverse of the normal cumulative distribution.
NORMSDIST|C|z|Returns the standard normal cumulative distribution.
NORMSINV|C|probability|Returns the inverse of the standard normal distribution.
NOT|L|logical|Reverses the logic of its argument.
NOW|D||Returns the current date and time.
NPER|F|rate, pmt, pv, [fv], [type]|Returns the number of periods for an investment.
NPV|F|rate, value1, [value2], …|Returns the net present value of cash flows.
NUMBERVALUE|T|text, [decimal_separator], [group_separator]|Converts text to a number in a locale-independent way.
OCT2BIN|E|number, [places]|Converts an octal number to binary.
OCT2DEC|E|number|Converts an octal number to decimal.
OCT2HEX|E|number, [places]|Converts an octal number to hexadecimal.
ODD|M|number|Rounds a number up to the nearest odd integer.
OFFSET|R|reference, rows, cols, [height], [width]|Returns a reference offset from a given reference.
OR|L|logical1, [logical2], …|Returns TRUE if any argument is TRUE.
PDURATION|F|rate, pv, fv|Returns the periods required to reach a value.
PEARSON|S|array1, array2|Returns the Pearson correlation coefficient.
PERCENTILE|C|array, k|Returns the k-th percentile.
PERCENTILE.EXC|S|array, k|Returns the k-th percentile, k exclusive of 0 and 1.
PERCENTILE.INC|S|array, k|Returns the k-th percentile, k inclusive.
PERCENTRANK|C|array, x, [significance]|Returns the percentage rank of a value.
PERCENTRANK.EXC|S|array, x, [significance]|Returns the rank of a value as a percentage (exclusive).
PERCENTRANK.INC|S|array, x, [significance]|Returns the rank of a value as a percentage (inclusive).
PERMUT|S|number, number_chosen|Returns the number of permutations.
PERMUTATIONA|S|number, number_chosen|Returns the number of permutations with repetitions.
PHI|S|x|Returns the density of the standard normal distribution.
PI|M||Returns the value of pi.
PMT|F|rate, nper, pv, [fv], [type]|Returns the periodic payment for a loan.
POISSON|C|x, mean, cumulative|Returns the Poisson distribution.
POISSON.DIST|S|x, mean, cumulative|Returns the Poisson distribution.
POWER|M|number, power|Returns a number raised to a power.
PPMT|F|rate, per, nper, pv, [fv], [type]|Returns the principal payment for a period.
PROB|S|x_range, prob_range, lower_limit, [upper_limit]|Returns the probability that values are between two limits.
PRODUCT|M|number1, [number2], …|Multiplies all its arguments.
PROPER|T|text|Capitalizes the first letter of each word.
PV|F|rate, nper, pmt, [fv], [type]|Returns the present value of an investment.
QUARTILE|C|array, quart|Returns the quartile of a data set.
QUARTILE.EXC|S|array, quart|Returns the quartile, exclusive.
QUARTILE.INC|S|array, quart|Returns the quartile, inclusive.
QUOTIENT|M|numerator, denominator|Returns the integer portion of a division.
RADIANS|M|angle|Converts degrees to radians.
RAND|M||Returns a random number between 0 and 1.
RANDARRAY|M|[rows], [columns], [min], [max], [whole_number]|Returns an array of random numbers.
RANDBETWEEN|M|bottom, top|Returns a random integer between two numbers.
RANK|C|number, ref, [order]|Returns the rank of a number in a list.
RANK.AVG|S|number, ref, [order]|Returns the rank; ties get the average rank.
RANK.EQ|S|number, ref, [order]|Returns the rank; ties get the top rank.
RATE|F|nper, pmt, pv, [fv], [type], [guess]|Returns the interest rate per period.
REDUCE|L|[initial_value], array, lambda|Reduces an array to a value with a LAMBDA.
REGEXEXTRACT|T|text, pattern, [return_mode], [case_sensitivity]|Extracts text that matches a regular expression.
REGEXREPLACE|T|text, pattern, replacement, [occurrence], [case_sensitivity]|Replaces text that matches a regular expression.
REGEXTEST|T|text, pattern, [case_sensitivity]|Checks whether text matches a regular expression.
REPLACE|T|old_text, start_num, num_chars, new_text|Replaces part of a text.
REPLACEB|T|old_text, start_num, num_bytes, new_text|Replaces part of a text.
REPT|T|text, number_times|Repeats text a number of times.
RIGHT|T|text, [num_chars]|Returns the rightmost characters of a text.
RIGHTB|T|text, [num_bytes]|Returns the rightmost characters of a text.
ROMAN|M|number, [form]|Converts a number to a Roman numeral.
ROUND|M|number, num_digits|Rounds a number to a number of digits.
ROUNDDOWN|M|number, num_digits|Rounds a number down, toward zero.
ROUNDUP|M|number, num_digits|Rounds a number up, away from zero.
ROW|R|[reference]|Returns the row number of a reference.
ROWS|R|array|Returns the number of rows in a reference or array.
RRI|F|nper, pv, fv|Returns an equivalent interest rate for growth.
RSQ|S|known_ys, known_xs|Returns the square of the Pearson correlation coefficient.
SCAN|L|[initial_value], array, lambda|Scans an array with a LAMBDA and returns the intermediate values.
SEARCH|T|find_text, within_text, [start_num]|Finds text within text (not case-sensitive, wildcards allowed).
SEARCHB|T|find_text, within_text, [start_num]|Finds text within text (not case-sensitive).
SEC|M|number|Returns the secant of an angle.
SECH|M|number|Returns the hyperbolic secant of an angle.
SECOND|D|serial_number|Returns the second (0–59).
SEQUENCE|M|rows, [columns], [start], [step]|Returns a list of sequential numbers.
SERIESSUM|M|x, n, m, coefficients|Returns the sum of a power series.
SHEET|I|[value]|Returns the sheet number of a referenced sheet.
SHEETS|I|[reference]|Returns the number of sheets.
SIGN|M|number|Returns the sign of a number.
SIN|M|number|Returns the sine of an angle.
SINH|M|number|Returns the hyperbolic sine of a number.
SKEW|S|number1, [number2], …|Returns the skewness of a distribution.
SKEW.P|S|number1, [number2], …|Returns the population skewness.
SLN|F|cost, salvage, life|Returns straight-line depreciation for one period.
SLOPE|S|known_ys, known_xs|Returns the slope of the linear regression line.
SMALL|S|array, k|Returns the k-th smallest value in a data set.
SORT|R|array, [sort_index], [sort_order], [by_col]|Sorts the contents of a range or array.
SORTBY|R|array, by_array1, [sort_order1], …|Sorts a range or array by the values in another range.
SQRT|M|number|Returns the square root.
SQRTPI|M|number|Returns the square root of (number × pi).
STANDARDIZE|S|x, mean, standard_dev|Returns a normalized value.
STDEV|C|number1, [number2], …|Estimates standard deviation based on a sample.
STDEV.P|S|number1, [number2], …|Calculates standard deviation of the entire population.
STDEV.S|S|number1, [number2], …|Estimates standard deviation based on a sample.
STDEVA|S|value1, [value2], …|Estimates standard deviation including text and logical values.
STDEVP|C|number1, [number2], …|Calculates standard deviation of the entire population.
STDEVPA|S|value1, [value2], …|Calculates population standard deviation including text and logical values.
STEYX|S|known_ys, known_xs|Returns the standard error of the predicted y-values.
SUBSTITUTE|T|text, old_text, new_text, [instance_num]|Substitutes new text for old text.
SUBTOTAL|M|function_num, ref1, [ref2], …|Returns a subtotal in a list.
SUM|M|number1, [number2], …|Adds its arguments.
SUMIF|M|range, criteria, [sum_range]|Adds the cells that meet a condition.
SUMIFS|M|sum_range, criteria_range1, criteria1, …|Adds the cells that meet several conditions.
SUMPRODUCT|M|array1, [array2], …|Returns the sum of the products of corresponding items.
SUMSQ|M|number1, [number2], …|Returns the sum of squares.
SUMX2MY2|M|array_x, array_y|Returns the sum of the differences of squares.
SUMX2PY2|M|array_x, array_y|Returns the sum of the sums of squares.
SUMXMY2|M|array_x, array_y|Returns the sum of squares of differences.
SWITCH|L|expression, value1, result1, [default_or_value2, result2], …|Matches an expression against values and returns the matching result.
SYD|F|cost, salvage, life, per|Returns sum-of-years' digits depreciation.
T|T|value|Returns the text of a value, or empty text.
T.DIST|S|x, deg_freedom, cumulative|Returns the left-tailed Student's t-distribution.
T.DIST.2T|S|x, deg_freedom|Returns the two-tailed Student's t-distribution.
T.DIST.RT|S|x, deg_freedom|Returns the right-tailed Student's t-distribution.
T.INV|S|probability, deg_freedom|Returns the left-tailed inverse of the t-distribution.
T.INV.2T|S|probability, deg_freedom|Returns the two-tailed inverse of the t-distribution.
T.TEST|S|array1, array2, tails, type|Returns the probability of a Student's t-test.
TAKE|R|array, rows, [columns]|Returns rows or columns from the start or end of an array.
TAN|M|number|Returns the tangent of an angle.
TANH|M|number|Returns the hyperbolic tangent of a number.
TDIST|C|x, deg_freedom, tails|Returns the Student's t-distribution.
TEXT|T|value, format_text|Formats a number and converts it to text.
TEXTAFTER|T|text, delimiter, [instance_num], [match_mode], [match_end], [if_not_found]|Returns text after a delimiter.
TEXTBEFORE|T|text, delimiter, [instance_num], [match_mode], [match_end], [if_not_found]|Returns text before a delimiter.
TEXTJOIN|T|delimiter, ignore_empty, text1, [text2], …|Joins text with a delimiter.
TEXTSPLIT|T|text, col_delimiter, [row_delimiter], [ignore_empty], [match_mode], [pad_with]|Splits text into rows or columns using delimiters.
TIME|D|hour, minute, second|Returns the serial number of a time.
TIMEVALUE|D|time_text|Converts a time in text form to a serial number.
TINV|C|probability, deg_freedom|Returns the two-tailed inverse of the t-distribution.
TOCOL|R|array, [ignore], [scan_by_column]|Returns an array as a single column.
TODAY|D||Returns the current date.
TOROW|R|array, [ignore], [scan_by_column]|Returns an array as a single row.
TRANSPOSE|R|array|Switches the rows and columns of an array.
TREND|S|known_ys, [known_xs], [new_xs], [const]|Returns values along a linear trend.
TRIM|T|text|Removes extra spaces from text.
TRIMMEAN|S|array, percent|Returns the mean of the interior of a data set.
TRUE|L||Returns the logical value TRUE.
TRUNC|M|number, [num_digits]|Truncates a number to an integer or number of digits.
TTEST|C|array1, array2, tails, type|Returns the probability of a Student's t-test.
TYPE|I|value|Returns a number indicating the data type of a value.
UNICHAR|T|number|Returns the Unicode character for a number.
UNICODE|T|text|Returns the Unicode number of the first character.
UNIQUE|R|array, [by_col], [exactly_once]|Returns the unique values of a range or array.
UPPER|T|text|Converts text to uppercase.
USDOLLAR|T|number, [decimals]|Converts a number to text in currency format.
VALUE|T|text|Converts text that represents a number to a number.
VALUETOTEXT|T|value, [format]|Returns any value as text.
VAR|C|number1, [number2], …|Estimates variance based on a sample.
VAR.P|S|number1, [number2], …|Calculates variance of the entire population.
VAR.S|S|number1, [number2], …|Estimates variance based on a sample.
VARA|S|value1, [value2], …|Estimates variance including text and logical values.
VARP|C|number1, [number2], …|Calculates variance of the entire population.
VARPA|S|value1, [value2], …|Calculates population variance including text and logical values.
VDB|F|cost, salvage, life, start_period, end_period, [factor], [no_switch]|Returns depreciation for any period using declining balance.
VLOOKUP|R|lookup_value, table_array, col_index_num, [range_lookup]|Looks up a value in the first column of a table and returns a value from the same row.
VSTACK|R|array1, [array2], …|Appends arrays vertically.
WEEKDAY|D|serial_number, [return_type]|Returns the day of the week as a number.
WEEKNUM|D|serial_number, [return_type]|Returns the week number of the year.
WEIBULL|C|x, alpha, beta, cumulative|Returns the Weibull distribution.
WEIBULL.DIST|S|x, alpha, beta, cumulative|Returns the Weibull distribution.
WORKDAY|D|start_date, days, [holidays]|Returns the date a number of workdays away.
WORKDAY.INTL|D|start_date, days, [weekend], [holidays]|Returns the date a number of workdays away with custom weekends.
WRAPCOLS|R|vector, wrap_count, [pad_with]|Wraps a row or column into columns.
WRAPROWS|R|vector, wrap_count, [pad_with]|Wraps a row or column into rows.
XIRR|F|values, dates, [guess]|Returns the internal rate of return for irregular cash flows.
XLOOKUP|R|lookup_value, lookup_array, return_array, [if_not_found], [match_mode], [search_mode]|Searches a range and returns the matching item from another range.
XMATCH|R|lookup_value, lookup_array, [match_mode], [search_mode]|Returns the relative position of an item in an array.
XNPV|F|rate, values, dates|Returns the net present value for irregular cash flows.
XOR|L|logical1, [logical2], …|Returns TRUE if an odd number of arguments are TRUE.
YEAR|D|serial_number|Returns the year.
YEARFRAC|D|start_date, end_date, [basis]|Returns the fraction of the year between two dates.
Z.TEST|S|array, x, [sigma]|Returns the one-tailed P-value of a z-test.
ZTEST|C|array, x, [sigma]|Returns the one-tailed P-value of a z-test.
`

export type FnMeta = { name: string; category: FnCategory; args: string[]; description: string }

export const FN_META = new Map<string, FnMeta>()
for (const line of RAW.trim().split('\n')) {
  const [name, cat, args, description] = line.split('|')
  FN_META.set(name, { name, category: CATS[cat], args: args ? args.split(/,\s*/) : [], description })
}

export function signature(name: string): string {
  const m = FN_META.get(name)
  return m ? `${name}(${m.args.join(', ')})` : `${name}()`
}

export function functionsIn(category: FnCategory): FnMeta[] {
  return [...FN_META.values()].filter((m) => m.category === category).sort((a, b) => a.name.localeCompare(b.name))
}
