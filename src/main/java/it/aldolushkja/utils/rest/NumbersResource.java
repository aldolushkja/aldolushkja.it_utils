package it.aldolushkja.utils.rest;

import it.aldolushkja.utils.interceptor.Loggable;
import java.util.Random;
import javax.inject.Inject;
import javax.ws.rs.DefaultValue;
import javax.ws.rs.GET;
import javax.ws.rs.Path;
import javax.ws.rs.PathParam;
import javax.ws.rs.Produces;
import javax.ws.rs.core.MediaType;

@Path("numbers")
@Loggable
public class NumbersResource {

  @Inject
  org.slf4j.Logger log;

  @GET
  @Produces(MediaType.TEXT_PLAIN)
  public String getRandomNumber() {
    Random random = new Random();
    String output = String.valueOf(random.nextInt(Integer.MAX_VALUE));
    log.info("NumbersResource.getRandomNumber() --- output: " + output);
    return output;
  }

  @GET
  @Path("/limit/{limit}")
  @Produces(MediaType.TEXT_PLAIN)
  public String getRandomNumberWithLimit(
      @DefaultValue("1000") @PathParam("limit") int limitNumber) {
    if (limitNumber < 0 || limitNumber > Integer.MAX_VALUE) {
      return "Fullfill the request with correct from number e.x. [ ?limit=1000 ]";
    }
    Random random = new Random();
    String output = String.valueOf(random.nextInt(limitNumber));
    log.info("NumbersResource.getRandomNumberWithLimit() ---- output: " + output);
    return output;
  }

}
