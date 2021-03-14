package org.acme.lifecycle;

import java.time.Duration;
import java.time.Instant;
import java.util.logging.Logger;
import javax.inject.Inject;
import javax.interceptor.AroundInvoke;
import javax.interceptor.Interceptor;
import javax.interceptor.InvocationContext;

@Interceptor
@Loggable
public class LoggingInterceptor {

  @Inject
  Logger log;

  @AroundInvoke
  public Object traceCallWithLogs(InvocationContext ic) throws Exception {
    Instant start = Instant.now();
    String className = ic.getMethod().getDeclaringClass().getName();
    String methodName = ic.getMethod().getName();
    // Object[] parameters = ic.getParameters();
    log.info("#### INIT [" + className + " - " + methodName + "]");
    try {
      return ic.proceed();
    } finally {
      Instant end = Instant.now();
      long methodDurationsMs = Duration.between(start, end).toMillis();
      log.info("#### END [" + className + " - " + methodName + "] - Execution tooks "
          + methodDurationsMs + " ms.");

    }
  }

}
